import { Worker } from 'worker_threads';
import { app, BrowserWindow, shell } from 'electron';
import fs from 'fs/promises';
import path from 'path';
// import { v4 as uuidv4 } from 'uuid'; // Unused
import {
    ScannerState,
    ScanSession,
    ScanStartPayload,
    FileNode,
    DuplicateCluster,
    ScanProgressPayload,
    IpcChannel,
    ActionPayload
} from '../shared/types';
import {
    WorkerMessageType,
    WorkerCommand,
    WorkerResponse,
    ScanResultResponse,
    HashResultResponse
} from '../shared/worker-types';
import { WORKER_POOL_SIZE } from '../shared/constants';
import { logger } from './logger';

export class ScanService {
    private workers: Worker[] = [];
    private workerReadyState: boolean[] = [];
    private session: ScanSession | null = null;
    private lastUpdate = 0;

    // Queues
    private dirQueue: string[] = [];
    private hashQueue: string[] = [];

    // Backpressure & Stats
    private activeWorkers = 0;
    private processedFiles = 0;
    private processedBytes = 0;
    private processedHashes = 0;

    // In-Memory Results
    private resultFiles: Map<string, FileNode> = new Map();

    constructor() { }

    getResults(sessionId: string): ScanSession | null {
        if (this.session && this.session.id === sessionId) {
            return this.session;
        }
        return null;
    }

    async start(payload: ScanStartPayload): Promise<void> {
        if (this.session && this.session.state === "SCANNING") {
            logger.warn('Scan start requested but already scanning');
            return;
        }

        logger.info('Starting Scan Session', { paths: payload.paths });

        this.session = {
            id: payload.sessionId,
            startedAt: new Date().toISOString(),
            state: "IDLE",
            duplicates: [],
            largeFiles: [],
            staleFiles: [],
            junkFiles: [],
            emptyFolders: []
        };

        this.resetState();
        this.dirQueue.push(...payload.paths);
        await this.initializeWorkers();
        this.updateState("SCANNING", true);
        this.processQueue();
    }

    cancel() {
        if (!this.session) return;
        logger.info('Cancelling scan');
        this.updateState("CANCELLING", true);
        this.terminateWorkers();
        this.updateState("COMPLETED", true);
    }

    private resetState() {
        this.dirQueue = [];
        this.hashQueue = [];
        this.resultFiles.clear();
        this.processedFiles = 0;
        this.processedBytes = 0;
        this.processedHashes = 0;
        this.activeWorkers = 0;
        this.lastUpdate = 0;
    }

    private async initializeWorkers() {
        this.terminateWorkers();

        const workerPath = app.isPackaged
            ? path.join(__dirname, 'worker.js')
            : path.join(__dirname, '../../out/main/worker.js');

        for (let i = 0; i < WORKER_POOL_SIZE; i++) {
            const worker = new Worker(workerPath);
            worker.on('message', (msg: WorkerResponse) => this.handleWorkerMessage(i, msg));
            worker.on('error', (err) => logger.error(`Worker ${i} error`, { error: err.message }));
            worker.on('exit', (code) => {
                if (code !== 0 && this.session?.state !== "CANCELLING") {
                    logger.error(`Worker ${i} exited with code ${code}`);
                }
            });
            this.workers.push(worker);
            this.workerReadyState.push(false);
        }
    }

    private terminateWorkers() {
        this.workers.forEach(w => w.terminate());
        this.workers = [];
        this.workerReadyState = [];
    }

    private updateState(newState: ScannerState, force = false) {
        if (!this.session) return;
        this.session.state = newState;

        const now = Date.now();
        // Throttle IPC updates for progress only (every 200ms)
        // Always send state changes (e.g. COMPLETED or IDLE) immediately unless forced
        if (!force && newState === "SCANNING" && now - this.lastUpdate < 200) {
            return;
        }
        this.lastUpdate = now;

        const progress: ScanProgressPayload = {
            sessionId: this.session.id,
            state: newState,
            filesScanned: this.processedFiles,
            bytesScanned: this.processedBytes,
            currentFile: this.session.state === "SCANNING" ? this.getLastScannedFile() : undefined
        };

        const wins = BrowserWindow.getAllWindows();
        wins.forEach(w => w.webContents.send(IpcChannel.ScanProgress, progress));
    }

    private getLastScannedFile(): string | undefined {
        if (this.resultFiles.size === 0) return undefined;
        // In Map, iteration order is insertion order
        const lastEntry = Array.from(this.resultFiles)[this.resultFiles.size - 1]; // Inefficient but simple for now
        return lastEntry ? lastEntry[1].path : undefined;
    }

    private processQueue() {
        if (!this.session || this.session.state !== "SCANNING") return;

        // Completion Check
        if (this.dirQueue.length === 0 && this.hashQueue.length === 0 && this.activeWorkers === 0) {
            if (this.session.duplicates.length === 0 && this.processedFiles > 0) {
                this.finalizeScan();
            } else {
                this.terminateWorkers();
                this.updateState("COMPLETED", true);
            }
            return;
        }

        // Hashing Priority
        while (this.hashQueue.length > 0 && this.activeWorkers < this.workers.length) {
            const nextPath = this.hashQueue.shift();
            if (nextPath) {
                const workerIndex = this.activeWorkers % this.workers.length;
                const msg: WorkerCommand = { type: WorkerMessageType.CMD_HASH_FILE, filePath: nextPath };
                this.workers[workerIndex].postMessage(msg);
                this.activeWorkers++;
            }
        }

        // Directory Scanning
        while (this.dirQueue.length > 0 && this.activeWorkers < this.workers.length) {
            const nextPath = this.dirQueue.shift();
            if (nextPath) {
                const workerIndex = this.processedFiles % this.workers.length;
                const msg: WorkerCommand = { type: WorkerMessageType.CMD_SCAN_DIR, path: nextPath };
                this.workers[workerIndex].postMessage(msg);
                this.activeWorkers++;
            }
        }
    }

    private handleWorkerMessage(index: number, msg: WorkerResponse) {
        switch (msg.type) {
            case WorkerMessageType.RES_READY:
                this.workerReadyState[index] = true;
                break;
            case WorkerMessageType.RES_SCAN_RESULT:
                this.activeWorkers--;
                this.handleScanResult(msg);
                this.processQueue();
                break;
            case WorkerMessageType.RES_HASH_RESULT:
                this.activeWorkers--;
                this.handleHashResult(msg);
                this.processQueue();
                break;
            case WorkerMessageType.RES_ERROR:
                this.activeWorkers--;
                logger.warn(`Worker Error: ${msg.error} at ${msg.path}`);
                this.processQueue();
                break;
        }
    }

    private handleScanResult(res: ScanResultResponse) {
        if (!this.session) return;
        this.dirQueue.push(...res.dirs);
        res.files.forEach(f => {
            this.resultFiles.set(f.id, f);
            this.processedFiles++;
            this.processedBytes += f.sizeBytes;
            if (f.sizeBytes > 100 * 1024 * 1024) {
                this.session?.largeFiles.push(f);
            }
        });

        this.updateState("SCANNING");
    }

    private handleHashResult(res: HashResultResponse) {
        if (!this.session) return;
        for (const file of this.resultFiles.values()) {
            if (file.path === res.filePath) {
                file.hash = res.hash;
                break;
            }
        }
        this.processedHashes++;
        this.updateState("SCANNING");
    }

    private finalizeScan() {
        // If we haven't hashed yet, try to find candidates
        if (this.processedHashes === 0 && this.resultFiles.size > 0) {
            logger.info('Scan Phase 1 Complete. Identifying Candidates for Hashing...');
            const candidates = this.identifyHashCandidates();
            if (candidates.length > 0) {
                this.hashQueue = candidates.map(f => f.path);
                logger.info(`Queued ${this.hashQueue.length} files for hashing.`);
                this.processQueue();
                return;
            }
        }

        this.buildDuplicateClusters();
        logger.info('Scan Complete.');
        this.updateState("COMPLETED", true);
        this.terminateWorkers();
    }

    private identifyHashCandidates(): FileNode[] {
        const sizeMap = new Map<number, FileNode[]>();
        for (const file of this.resultFiles.values()) {
            if (file.isDirectory) continue;
            const list = sizeMap.get(file.sizeBytes) || [];
            list.push(file);
            sizeMap.set(file.sizeBytes, list);
        }

        const candidates: FileNode[] = [];
        for (const [size, list] of sizeMap) {
            if (size > 0 && list.length > 1) {
                candidates.push(...list);
            }
        }
        return candidates;
    }

    private buildDuplicateClusters() {
        if (!this.session) return;
        const clusters: DuplicateCluster[] = [];
        const hashMap = new Map<string, FileNode[]>();

        for (const file of this.resultFiles.values()) {
            if (file.hash) {
                const list = hashMap.get(file.hash) || [];
                list.push(file);
                hashMap.set(file.hash, list);
            }
        }

        for (const [hash, list] of hashMap) {
            if (list.length > 1) {
                clusters.push({ hash, files: list });
            }
        }
        this.session.duplicates = clusters;
        logger.info(`Analysis Finished. Identified ${clusters.length} duplicate clusters.`);
    }

    // --- Actions ---

    async moveToTrash(payload: ActionPayload): Promise<{ success: string[]; failures: string[] }> {
        const success: string[] = [];
        const failures: string[] = [];

        for (const id of payload.fileIds) {
            const file = this.resultFiles.get(id);
            if (!file) {
                logger.warn(`Trash action: File not found ${id}`);
                failures.push(id);
                continue;
            }
            if (payload.dryRun) {
                logger.info(`[DryRun] Would trash: ${file.path}`);
                success.push(id);
                continue;
            }
            try {
                await shell.trashItem(file.path);
                this.resultFiles.delete(id);
                success.push(id);
            } catch (err: any) {
                logger.error(`Failed to trash ${file.path}`, { error: err.message });
                failures.push(id);
            }
        }
        return { success, failures };
    }

    async quarantine(payload: ActionPayload): Promise<{ success: string[]; failures: string[] }> {
        const success: string[] = [];
        const failures: string[] = [];
        const quarantineDir = path.join(app.getPath('userData'), '_Quarantine');

        try {
            await fs.mkdir(quarantineDir, { recursive: true });
        } catch (err) {
            logger.error('Failed to create quarantine dir');
            return { success: [], failures: payload.fileIds };
        }

        for (const id of payload.fileIds) {
            const file = this.resultFiles.get(id);
            if (!file) {
                failures.push(id);
                continue;
            }
            if (payload.dryRun) {
                logger.info(`[DryRun] Would quarantine: ${file.path}`);
                success.push(id);
                continue;
            }
            try {
                const dest = path.join(quarantineDir, path.basename(file.path) + `_${Date.now()}.bak`);
                await fs.rename(file.path, dest);
                this.resultFiles.delete(id);
                success.push(id);
            } catch (err: any) {
                logger.error(`Failed to quarantine ${file.path}`, { error: err.message });
                failures.push(id);
            }
        }
        return { success, failures };
    }
}

export const scanService = new ScanService();
