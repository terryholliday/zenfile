import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { clsx } from 'clsx'
import { FileNode } from '../../../shared/types'

interface SearchResult {
    id: string
    path: string
    score: number
}

export function ChatDashboard() {
    const [query, setQuery] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [results, setResults] = useState<SearchResult[]>([])
    const [hasSearched, setHasSearched] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim()) return

        setIsSearching(true)
        setHasSearched(true)
        setResults([])

        try {
            const hits = await window.fileZen.aiSearch(query)
            setResults(hits)
        } catch (err) {
            console.error('Search failed', err)
        } finally {
            setIsSearching(false)
        }
    }

    return (
        <div className="flex flex-col h-full bg-transparent p-6 max-w-4xl mx-auto w-full">
            <header className="mb-8 text-center">
                <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 mb-2">
                    Ask FileZen
                </h2>
                <p className="text-neutral-400">
                    Find anything. "Show me all invoices from last year" or "Where is my passport?"
                </p>
            </header>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="relative mb-8 group">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-xl blur-lg transition-opacity opacity-50 group-hover:opacity-100" />
                <div className="relative flex items-center bg-neutral-900 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                    <span className="pl-4 text-2xl">✨</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Describe the file you're looking for..."
                        className="w-full bg-transparent text-white px-4 py-4 text-lg focus:outline-none placeholder:text-neutral-600"
                    />
                    <button
                        type="submit"
                        disabled={isSearching || !query.trim()}
                        className="px-6 py-2 m-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
                    >
                        {isSearching ? 'Thinking...' : 'Ask'}
                    </button>
                </div>
            </form>

            {/* Results */}
            <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4">
                <AnimatePresence>
                    {results.map((hit, i) => (
                        <motion.div
                            key={hit.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="p-4 bg-neutral-800/50 border border-neutral-700/50 rounded-lg hover:bg-neutral-800 transition-colors group cursor-pointer"
                            onClick={() => {
                                // TODO: Open file location
                            }}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <h4 className="font-medium text-indigo-300 truncate pr-4">
                                    {hit.path.split(/[\\/]/).pop()}
                                </h4>
                                <span className="text-[10px] bg-neutral-700 text-neutral-400 px-1.5 py-0.5 rounded">
                                    {Math.round(hit.score * 100)}% match
                                </span>
                            </div>
                            <p className="text-xs text-neutral-500 font-mono truncate">
                                {hit.path}
                            </p>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {hasSearched && !isSearching && results.length === 0 && (
                    <div className="text-center text-neutral-500 mt-12">
                        <div className="text-4xl mb-2 opacity-30">🤔</div>
                        <p>No results found. Try rephrasing?</p>
                    </div>
                )}
            </div>
        </div>
    )
}
