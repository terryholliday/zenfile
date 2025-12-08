import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { useScanStore } from '../store/useScanStore';

export function ScanDashboard() {
    const {
        scanState,
        filesScanned,
        bytesScanned,
        settings,
        setIncludePath,
        startScan,
        cancelScan,
        currentFile
    } = useScanStore();

    const isScanning = scanState === 'SCANNING';
    const isIdle = scanState === 'IDLE' || scanState === 'COMPLETED';

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="flex flex-col items-center justify-center p-8 space-y-8 min-h-[480px]">

            {/* Progress Ring / Status Indicator */}
            <div className="relative w-72 h-72 flex items-center justify-center">
                <div className="absolute inset-[-14px] rounded-full bg-gradient-to-br from-indigo-400/25 via-purple-400/15 to-blue-400/20 blur-3xl" />
                {/* Background Ring */}
                <div className="absolute inset-0 rounded-full border border-white/10 backdrop-blur-xl bg-white/5 shadow-[0_0_50px_-30px_rgba(99,102,241,0.8)]" />

                {/* Animated Ring */}
                <motion.div
                    className={clsx(
                        "absolute inset-0 rounded-full border-4 border-indigo-400/70",
                        isScanning ? "opacity-100" : "opacity-30"
                    )}
                    animate={isScanning ? { rotate: 360 } : { rotate: 0 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    style={{
                        borderRightColor: 'transparent',
                        borderBottomColor: 'transparent'
                    }}
                />

                {/* Center Content */}
                <div className="text-center z-10">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        key={scanState}
                        className="flex flex-col items-center"
                    >
                        <h3 className="text-4xl font-bold text-white tracking-tighter drop-shadow-[0_6px_18px_rgba(79,70,229,0.25)]">
                            {scanState === 'IDLE' ? 'Ready' :
                                scanState === 'SCANNING' ? 'Scanning' :
                                    scanState === 'COMPLETED' ? 'Done' : scanState}
                        </h3>
                        <p className="text-neutral-300 text-sm mt-2">
                            {scanState === 'SCANNING'
                                ? `${formatBytes(bytesScanned)} processed`
                                : 'Waiting for command'}
                        </p>
                    </motion.div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 w-full max-w-2xl">
                {[{ label: 'Files Scanned', value: filesScanned.toLocaleString(), accent: 'text-indigo-300', glow: 'from-indigo-500/20 to-blue-500/10' },
                { label: 'Data Processed', value: formatBytes(bytesScanned), accent: 'text-emerald-300', glow: 'from-emerald-500/20 to-cyan-500/10' }].map((stat) => (
                    <motion.div
                        key={stat.label}
                        whileHover={{ scale: 1.02 }}
                        className="relative overflow-hidden p-5 rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_20px_60px_-35px_rgba(0,0,0,0.6)]"
                    >
                        <div className={clsx("absolute inset-0 blur-3xl", `bg-gradient-to-br ${stat.glow}`)} />
                        <div className="relative">
                            <div className="text-sm text-neutral-300/80 uppercase tracking-wide">{stat.label}</div>
                            <div className={clsx("text-2xl font-mono mt-1", stat.accent)}>{stat.value}</div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Controls */}
            <div className="flex flex-col items-center gap-4 w-full">
                {isIdle && (
                    <div className="flex items-center gap-4 w-full max-w-2xl p-4 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_20px_50px_-35px_rgba(0,0,0,0.65)]">
                        <div className="flex-1 truncate text-left">
                            <div className="text-[11px] text-neutral-300 uppercase tracking-[0.16em] font-bold mb-1">Target Directory</div>
                            <div className="text-neutral-50/90 text-sm truncate font-mono" title={settings?.includePaths[0]}>
                                {settings?.includePaths[0] || "No directory selected"}
                            </div>
                        </div>
                        <motion.button
                            onClick={async () => {
                                const path = await window.fileZen.openDirectory();
                                if (path) setIncludePath(path);
                            }}
                            whileHover={{ scale: 1.02, boxShadow: '0 12px 35px -20px rgba(99,102,241,0.8)' }}
                            whileTap={{ scale: 0.98 }}
                            className="px-4 py-2 text-sm bg-gradient-to-br from-white/10 to-white/5 border border-white/10 text-white rounded-lg transition-colors shadow-[0_10px_30px_-22px_rgba(99,102,241,0.8)]"
                        >
                            Change
                        </motion.button>
                    </div>
                )}

                <div className="flex gap-4">
                    {isIdle ? (
                        <motion.button
                            onClick={() => startScan(settings?.includePaths || [])}
                            whileHover={{ scale: 1.04, boxShadow: '0 20px 50px -20px rgba(99,102,241,0.8)' }}
                            whileTap={{ scale: 0.96 }}
                            animate={{
                                boxShadow: [
                                    '0 15px 45px -20px rgba(99,102,241,0.45)',
                                    '0 18px 55px -22px rgba(99,102,241,0.7)',
                                    '0 15px 45px -20px rgba(99,102,241,0.45)'
                                ]
                            }}
                            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                            className="relative px-10 py-3 bg-gradient-to-br from-indigo-500 to-blue-500 text-white rounded-xl font-semibold shadow-[0_20px_60px_-25px_rgba(99,102,241,0.6)] border border-white/10 w-52 overflow-hidden"
                        >
                            <span className="absolute inset-0 bg-white/10 blur-xl" />
                            <span className="relative">Start Smart Scan</span>
                        </motion.button>
                    ) : (
                        <motion.button
                            onClick={() => cancelScan()}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            className="px-10 py-3 bg-red-900/60 hover:bg-red-800/70 border border-red-500/50 text-red-100 rounded-xl font-semibold transition-colors w-52 backdrop-blur-xl shadow-[0_20px_50px_-25px_rgba(239,68,68,0.45)]"
                            disabled={scanState === 'CANCELLING'}
                        >
                            {scanState === 'CANCELLING' ? 'Stopping...' : 'Stop Scan'}
                        </motion.button>
                    )}
                </div>

                {/* Live Scan Results */}
                {isScanning && currentFile && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-3xl mt-4 px-5 py-4 bg-white/5 rounded-xl border border-white/10 backdrop-blur-xl shadow-[0_20px_50px_-35px_rgba(0,0,0,0.7)]"
                    >
                        <div className="flex items-center gap-2 text-xs text-neutral-300 mb-2 uppercase tracking-[0.18em]">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.7)]" />
                            <span className="font-semibold">Processing</span>
                        </div>
                        <div className="text-neutral-100 font-mono text-sm truncate" title={currentFile}>
                            {currentFile}
                        </div>
                    </motion.div>
                )}
            </div>

        </div>
    );
}
