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
    ActionPayload,
    AiRecommendation
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
    private aiRecommendations: AiRecommendation[] = [];

    constructor() { }

    getResults(sessionId: string): ScanSession | null {
        if (this.session && this.session.id === sessionId) {
            return this.session;
        }
        return null;
    }

    getAiRecommendations(sessionId: string): AiRecommendation[] {
        if (this.session && this.session.id === sessionId) {
            return this.aiRecommendations;
        }
        return [];
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
            emptyFolders: [],
            aiRecommendations: []
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
        this.aiRecommendations = [];
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
                if (code !== 0) logger.error(`Worker ${i} exited with code ${code}`);
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
            bytesScanned: this.processedBytes
        };

        const wins = BrowserWindow.getAllWindows();
        wins.forEach(w => w.webContents.send(IpcChannel.ScanProgress, progress));
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
        this.buildAiRecommendations();
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

    private buildAiRecommendations() {
        if (!this.session) return;

        const files = Array.from(this.resultFiles.values()).filter(f => !f.isDirectory);
        const buckets = new Map<string, FileNode[]>();

        for (const file of files) {
            const normalized = this.normalizeName(file.name);
            if (!normalized) continue;
            const key = normalized.slice(0, 6);
            const list = buckets.get(key) || [];
            list.push(file);
            buckets.set(key, list);
        }

        const recommendations: AiRecommendation[] = [];
        const usedIds = new Set<string>();

        for (const bucket of buckets.values()) {
            for (let i = 0; i < bucket.length; i++) {
                const current = bucket[i];
                if (usedIds.has(current.id)) continue;

                const cluster: FileNode[] = [current];
                let bestSimilarity = 0;
                const currentName = this.normalizeName(current.name);

                for (let j = i + 1; j < bucket.length; j++) {
                    const candidate = bucket[j];
                    const similarity = this.stringSimilarity(currentName, this.normalizeName(candidate.name));
                    if (similarity >= 0.88) {
                        cluster.push(candidate);
                        bestSimilarity = Math.max(bestSimilarity, similarity);
                    }
                }

                if (cluster.length > 1) {
                    cluster.forEach(f => usedIds.add(f.id));
                    const { recommended, reason } = this.pickRecommendedFile(cluster);
                    recommendations.push({
                        id: `${this.session.id}-${recommended.id}`,
                        similarFiles: cluster,
                        recommendedFileId: recommended.id,
                        reason,
                        similarity: Math.round(bestSimilarity * 100) / 100
                    });
                }
            }
        }

        this.aiRecommendations = recommendations;
        this.session.aiRecommendations = recommendations;
        logger.info(`AI analysis finished. Generated ${recommendations.length} keep recommendations.`);
    }

    private pickRecommendedFile(files: FileNode[]): { recommended: FileNode; reason: string } {
        const recommended = files.reduce((best, candidate) => {
            if (!best) return candidate;
            const bestTime = best.mtimeMs ?? 0;
            const candidateTime = candidate.mtimeMs ?? 0;

            if (candidateTime > bestTime) return candidate;
            if (candidateTime === bestTime && candidate.sizeBytes > best.sizeBytes) return candidate;
            if (candidateTime === bestTime && candidate.sizeBytes === best.sizeBytes && candidate.path.length < best.path.length) return candidate;
            return best;
        }, files[0]);

        const newestTime = recommended.mtimeMs ? new Date(recommended.mtimeMs).toLocaleString() : null;
        const largestSize = Math.max(...files.map(f => f.sizeBytes));
        const reasons: string[] = [];

        if (newestTime) {
            reasons.push(`Most recently updated (${newestTime})`);
        }
        if (recommended.sizeBytes === largestSize) {
            reasons.push('Largest copy, less likely truncated');
        }
        if (reasons.length === 0) {
            reasons.push('Chosen as the canonical copy for similar names');
        }

        return { recommended, reason: reasons.join(' • ') };
    }

    private normalizeName(name: string): string {
        const parsed = path.parse(name);
        return parsed.name.toLowerCase().replace(/\d+/g, '').replace(/[\s._-]+/g, ' ').trim();
    }

    private stringSimilarity(a: string, b: string): number {
        if (a === b) return 1;
        if (!a || !b) return 0;

        const matrix: number[][] = Array.from({ length: b.length + 1 }, () => Array.from({ length: a.length + 1 }, () => 0));
        for (let i = 0; i <= b.length; i++) {
            matrix[i][0] = i;
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j - 1] + 1
                    );
                }
            }
        }

        const distance = matrix[b.length][a.length];
        const maxLength = Math.max(a.length, b.length);
        return maxLength === 0 ? 1 : 1 - distance / maxLength;
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
