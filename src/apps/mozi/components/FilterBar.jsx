import React from 'react';
import { Search } from 'lucide-react';
import { isUpcomingItem, isWatchlistItem } from '../hooks/useFilters';

export function FilterBar({
                              movies,
                              mediaType,
                              setMediaType,
                              statusTab,
                              setStatusTab,
                              selectedGenre,
                              setSelectedGenre,
                              searchQuery,
                              setSearchQuery,
                              availableGenres,
                          }) {
    const watchlistCount = movies.filter(isWatchlistItem).length;
    const upcomingCount = movies.filter(isUpcomingItem).length;
    const watchedCount = movies.filter((m) => {
        if (m.media_type === 'movie') return m.watched;
        const w = (m.watched_seasons || []).length;
        const r = m.released_seasons || 1;
        return r > 0 && w >= r;
    }).length;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Típus váltó */}
                <div className="flex gap-1.5">
                    {[
                        { id: 'all', label: 'MIND' },
                        { id: 'movie', label: 'FILMEK' },
                        { id: 'tv', label: 'SOROZATOK' },
                    ].map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setMediaType(t.id)}
                            className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider border transition ${
                                mediaType === t.id
                                    ? 'bg-amber-400 text-black border-amber-400 shadow-[3px_3px_0px_0px_#000]'
                                    : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-amber-500/50 hover:text-amber-200'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Státusz fülek (Megnézendő / Már láttuk / Hamarosan) */}
                <div className="flex flex-wrap gap-1.5">
                    {[
                        { id: 'watchlist', label: `MEGNÉZENDŐ (${watchlistCount})` },
                        { id: 'watched', label: `MÁR LÁTTUK (${watchedCount})` },
                        { id: 'upcoming', label: `HAMAROSAN (${upcomingCount})` },
                    ].map((s) => (
                        <button
                            key={s.id}
                            onClick={() => setStatusTab(s.id)}
                            className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider border transition ${
                                statusTab === s.id
                                    ? 'bg-amber-400 text-black border-amber-400 shadow-[3px_3px_0px_0px_#000]'
                                    : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-amber-500/50 hover:text-amber-200'
                            }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Kereső */}
            <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Keresés cím vagy megjegyzés szerint..."
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-400 pl-10 pr-4 py-2.5 text-xs text-amber-100 placeholder-zinc-500 focus:outline-none"
                />
            </div>

            {/* Dinamikus műfaj chipek */}
            {availableGenres.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                        onClick={() => setSelectedGenre('all')}
                        className={`text-[10px] px-2.5 py-1 border uppercase font-bold transition ${
                            selectedGenre === 'all'
                                ? 'bg-amber-400 text-black border-amber-400'
                                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600'
                        }`}
                    >
                        Minden műfaj
                    </button>
                    {availableGenres.map((genre) => (
                        <button
                            key={genre}
                            onClick={() => setSelectedGenre(genre)}
                            className={`text-[10px] px-2.5 py-1 border uppercase font-bold transition ${
                                selectedGenre === genre
                                    ? 'bg-amber-400 text-black border-amber-400'
                                    : 'bg-zinc-900 text-amber-200/80 border-zinc-800 hover:border-amber-500/40'
                            }`}
                        >
                            {genre}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
