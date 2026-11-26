import React, { useState } from 'react';
import { X, RotateCw, Play, Plus, Sparkles, Ticket } from 'lucide-react';
import { discoverRandomMedia, discoverBasedOnLiked } from '../lib/tmdb';
import { isWatchlistItem } from '../hooks/useFilters';
import { useGlobalError } from '../../../shared/ErrorContext';

export function RouletteModal({ isOpen, onClose, movies, onAddMovie }) {
    const [mode, setMode] = useState('local'); // 'local' | 'discover' | 'liked'
    const [mediaFilter, setMediaFilter] = useState('all'); // 'all' | 'movie' | 'tv'
    const [selectedGenre, setSelectedGenre] = useState('all');
    const [picks, setPicks] = useState([]);
    const [seedTitle, setSeedTitle] = useState(null);
    const [expandedIds, setExpandedIds] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { showError } = useGlobalError();
    const [addedIds, setAddedIds] = useState([]);

    if (!isOpen) return null;

    const unwatched = movies.filter(isWatchlistItem);
    const likedItems = movies.filter((m) => m.rating_state === 'liked');

    const genres = Array.from(
        new Set(unwatched.flatMap((m) => m.genres || []))
    ).sort();

    const handleSpin = async () => {
        setError('');
        setExpandedIds({});
        setSeedTitle(null);

        if (mode === 'local') {
            const pool = unwatched.filter((m) => {
                if (mediaFilter !== 'all' && m.media_type !== mediaFilter) return false;
                if (
                    selectedGenre !== 'all' &&
                    !(m.genres || []).includes(selectedGenre)
                ) {
                    return false;
                }
                return true;
            });

            const shuffled = [...pool].sort(() => 0.5 - Math.random()).slice(0, 3);
            setPicks(shuffled);
            if (shuffled.length === 0) {
                setError('Nincs a szűrésnek megfelelő megnézendő tétel a listádon.');
            }
            return;
        }

        setLoading(true);
        try {
            const existingTmdbIds = movies.map((m) => m.tmdb_id);
            if (mode === 'discover') {
                const targetType = mediaFilter === 'tv' ? 'tv' : 'movie';
                const results = await discoverRandomMedia(targetType, existingTmdbIds);
                setPicks(results);
            } else if (mode === 'liked') {
                const res = await discoverBasedOnLiked(likedItems, existingTmdbIds);
                setSeedTitle(res.seedTitle);
                setPicks(res.items);
            }
        } catch (err) {
            setError(err.message);
            showError(err, 'TMDB hiba.');
            setPicks([]);
        } finally {
            setLoading(false);
        }
    };

    const handleQuickAdd = async (item) => {
        try {
            await onAddMovie(item);
            setAddedIds((prev) => [...prev, item.tmdb_id]);
        } catch (err) {
            setError(err.message);
            showError(err, 'TMDB hiba.');
        }
    };

    const toggleExpand = (key) => {
        setExpandedIds((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-5xl bg-zinc-950 border-2 border-amber-500/50 p-6 shadow-[8px_8px_0px_0px_#78350f] relative my-auto">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-zinc-400 hover:text-amber-300"
                >
                    <X className="w-6 h-6" />
                </button>

                {/* Fejléc */}
                <div className="flex items-center gap-2 text-amber-400 mb-4">
                    <Ticket className="w-6 h-6" />
                    <h2 className="text-xl sm:text-2xl font-black tracking-wider uppercase">
                        MIT NÉZZÜNK MA?
                    </h2>
                </div>

                {/* Módválasztó fülek */}
                <div className="flex flex-wrap gap-2 mb-4">
                    <button
                        onClick={() => setMode('local')}
                        className={`px-4 py-2 text-xs font-bold uppercase border transition ${
                            mode === 'local'
                                ? 'bg-amber-400 text-black border-amber-400 shadow-[3px_3px_0px_0px_#000]'
                                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-amber-500/50'
                        }`}
                    >
                        Saját gyűjteményből
                    </button>

                    <button
                        onClick={() => setMode('liked')}
                        className={`px-4 py-2 text-xs font-bold uppercase border transition flex items-center gap-1.5 ${
                            mode === 'liked'
                                ? 'bg-amber-400 text-black border-amber-400 shadow-[3px_3px_0px_0px_#000]'
                                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-amber-500/50'
                        }`}
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        Kedvencek alapján ({likedItems.length})
                    </button>

                    <button
                        onClick={() => setMode('discover')}
                        className={`px-4 py-2 text-xs font-bold uppercase border transition ${
                            mode === 'discover'
                                ? 'bg-amber-400 text-black border-amber-400 shadow-[3px_3px_0px_0px_#000]'
                                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-amber-500/50'
                        }`}
                    >
                        Nyitott felfedezés
                    </button>
                </div>

                {/* Szűrők (csak helyi és nyitott módban) */}
                {mode !== 'liked' && (
                    <div className="space-y-3 mb-4">
                        <div className="flex gap-1.5">
                            {[
                                { id: 'all', label: 'Mind', disabled: mode === 'discover' },
                                { id: 'movie', label: 'Film', disabled: false },
                                { id: 'tv', label: 'Sorozat', disabled: false },
                            ]
                                .filter((x) => !x.disabled)
                                .map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => setMediaFilter(t.id)}
                                        className={`px-3 py-1.5 text-xs font-bold border ${
                                            mediaFilter === t.id
                                                ? 'bg-amber-400 text-black border-amber-400'
                                                : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                        </div>

                        {mode === 'local' && genres.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    onClick={() => setSelectedGenre('all')}
                                    className={`text-[10px] px-2.5 py-1 border font-bold ${
                                        selectedGenre === 'all'
                                            ? 'bg-amber-400 text-black border-amber-400'
                                            : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                    }`}
                                >
                                    Minden műfaj
                                </button>
                                {genres.map((g) => (
                                    <button
                                        key={g}
                                        onClick={() => setSelectedGenre(g)}
                                        className={`text-[10px] px-2.5 py-1 border font-bold ${
                                            selectedGenre === g
                                                ? 'bg-amber-400 text-black border-amber-400'
                                                : 'bg-zinc-900 text-zinc-300 border-zinc-800'
                                        }`}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Pörgetés gomb */}
                <button
                    onClick={handleSpin}
                    disabled={loading}
                    className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider shadow-[4px_4px_0px_0px_#000] active:translate-x-1 active:translate-y-1 transition flex items-center gap-2 mb-5"
                >
                    <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'KERESÉS...' : 'PÖRGETÉS / ÚJRAPÖRGETÉS'}
                </button>

                {seedTitle && (
                    <div className="mb-4 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                        Mivel tetszett a(z) <strong className="underline">{seedTitle}</strong>, ezeket ajánljuk:
                    </div>
                )}

                {error && (
                    <div className="mb-4 text-xs text-red-400 bg-red-950/50 border border-red-800 p-3">
                        {error}
                    </div>
                )}

                {/* 3 SORSOLT KÁRTYA - items-start biztosítja, hogy csak a lenyitott doboz nőjön meg! */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    {picks.map((item, idx) => {
                        const key = item.tmdb_id || idx;
                        const isExpanded = !!expandedIds[key];
                        const isAlreadyAdded =
                            addedIds.includes(item.tmdb_id) ||
                            movies.some((m) => m.tmdb_id === item.tmdb_id);

                        return (
                            <div
                                key={key}
                                className="bg-zinc-900 border border-amber-500/40 flex flex-col justify-between p-4 shadow-lg"
                            >
                                <div>
                                    <div className="flex gap-3">
                                        <img
                                            src={
                                                item.poster_path
                                                    ? `https://image.tmdb.org/t/p/w200${item.poster_path}`
                                                    : 'https://placehold.co/150x220/18181b/f59e0b?text=FILM'
                                            }
                                            alt={item.title}
                                            className="w-20 h-28 object-cover border border-zinc-800 flex-shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex justify-between items-start gap-1">
                        <span className="text-[9px] px-1.5 py-0.5 border border-amber-500/40 text-amber-300 font-bold uppercase">
                          {item.media_type === 'tv' ? 'SOROZAT' : 'FILM'}
                        </span>
                                                <span className="text-xs bg-amber-400 text-black px-1.5 py-0.5 font-bold">
                          ★ {item.vote_average}
                        </span>
                                            </div>
                                            <h3 className="font-bold text-sm text-amber-100 mt-1.5 leading-tight">
                                                {item.title}
                                            </h3>
                                            <div className="text-[10px] text-zinc-500 mt-0.5">
                                                {item.release_year} {item.imdb_id ? `• ${item.imdb_id}` : ''}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-1 my-2.5">
                                        {(item.genres || []).map((g) => (
                                            <span
                                                key={g}
                                                className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-amber-200/80 border border-zinc-700"
                                            >
                        {g}
                      </span>
                                        ))}
                                    </div>

                                    <p
                                        className={`text-xs text-zinc-400 leading-relaxed ${
                                            isExpanded ? '' : 'line-clamp-3'
                                        }`}
                                    >
                                        {item.overview}
                                    </p>
                                    {item.overview && item.overview.length > 100 && (
                                        <button
                                            onClick={() => toggleExpand(key)}
                                            className="text-[10px] text-amber-400 hover:underline mt-1"
                                        >
                                            {isExpanded ? '▲ Kevesebb' : '▼ Tovább'}
                                        </button>
                                    )}
                                </div>

                                <div className="pt-3 mt-3 border-t border-dashed border-zinc-800 flex items-center justify-between gap-2">
                                    <a
                                        href={item.trailer_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-200 text-[10px] font-bold uppercase flex items-center gap-1"
                                    >
                                        <Play className="w-3 h-3" /> ELŐZETES
                                    </a>

                                    {mode !== 'local' && (
                                        <button
                                            onClick={() => handleQuickAdd(item)}
                                            disabled={isAlreadyAdded}
                                            className={`px-3 py-1.5 text-[10px] font-bold uppercase flex items-center gap-1 border ${
                                                isAlreadyAdded
                                                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                                                    : 'bg-amber-400 hover:bg-amber-300 text-black border-amber-400'
                                            }`}
                                        >
                                            <Plus className="w-3 h-3" />
                                            {isAlreadyAdded ? 'MENTVE' : 'HOZZÁAD'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
