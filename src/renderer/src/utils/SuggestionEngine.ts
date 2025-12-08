import { FileNode, DuplicateCluster } from '../../../shared/types';

export interface FileRecommendation {
    file: FileNode;
    action: 'KEEP' | 'DELETE';
    reason: string;
    score: number;
}

export function analyzeCluster(cluster: DuplicateCluster): FileRecommendation[] {
    const files = cluster.files;
    if (files.length < 2) return [];

    // Scoring System
    // We want to find the "Best" file to KEEP.
    // Criteria:
    // 1. Newest (Modification Time)
    // 2. Shortest Path (Usually the 'original')
    // 3. User Preferred Paths (Future)

    const scored = files.map(f => {
        let score = 0;
        const reasons: string[] = [];

        // Factor 1: Path Length (Shorter is usually better/original)
        const depth = f.path.split(/[/\\]/).length;
        score -= depth * 10; // Penalize deep nesting

        // Factor 2: Recency
        if (f.mtimeMs) {
            score += f.mtimeMs / 10000000000; // Small weight for recency
        }

        // Factor 3: Keywords
        if (f.path.toLowerCase().includes('copy') || f.path.toLowerCase().includes('backup')) {
            score -= 500;
            reasons.push("Looks like a copy");
        }

        return { file: f, score, reasons };
    });

    // Sort by score descending (Best first)
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    const recommendations: FileRecommendation[] = [];

    // The winner
    recommendations.push({
        file: best.file,
        action: 'KEEP',
        reason: "Best candidate (Shortest path / Original)",
        score: best.score
    });

    // The losers
    for (let i = 1; i < scored.length; i++) {
        const item = scored[i];
        let reason = "Duplicate";
        if (item.reasons.length > 0) reason = item.reasons.join(", ");
        else if (item.file.mtimeMs && best.file.mtimeMs && item.file.mtimeMs < best.file.mtimeMs) {
            reason = "Older version";
        } else {
            reason = "Redundant copy";
        }

        recommendations.push({
            file: item.file,
            action: 'DELETE',
            reason: reason,
            score: item.score
        });
    }

    return recommendations;
}
