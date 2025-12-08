import { useState, useEffect } from 'react'

export function ClaritySlider() {
    const [clarity, setClarity] = useState(0.5)

    useEffect(() => {
        // Update global CSS variables based on clarity value (0 to 1)
        const root = document.documentElement

        // --zen-clarity: 0 (Zen) to 1 (God Mode)
        root.style.setProperty('--zen-clarity', clarity.toString())

        // Derived variables for easy usage
        // Opacity for "noise" (extra details): 0 in Zen, 1 in God
        root.style.setProperty('--zen-noise-opacity', clarity.toString())

        // Spacing: Larger in Zen, Tighter in God
        // e.g. 1.5rem -> 0.5rem
        const spacing = 1.5 - (clarity * 1.0)
        root.style.setProperty('--zen-spacing', `${spacing}rem`)

        // Blur: High blur in Zen (for background), Low blur in God
        const blur = 10 - (clarity * 10)
        // root.style.setProperty('--zen-blur', `${blur}px`)

    }, [clarity])

    return (
        <div className="flex items-center gap-2 group">
            <span className="text-xs font-medium text-neutral-500 group-hover:text-neutral-300 transition-colors">
                ZEN
            </span>
            <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={clarity}
                onChange={(e) => setClarity(parseFloat(e.target.value))}
                className="w-24 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer hover:bg-neutral-600 accent-indigo-500 transition-all"
            />
            <span className="text-xs font-medium text-neutral-500 group-hover:text-neutral-300 transition-colors">
                GOD
            </span>
        </div>
    )
}
