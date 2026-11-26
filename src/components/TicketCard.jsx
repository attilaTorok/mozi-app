import React, { useState } from 'react';
import {
    Play,
    Trash2,
    RefreshCw,
    ThumbsUp,
    ThumbsDown,
    Meh,
    StickyNote,
    Calendar,
    Check,
} from 'lucide-react';

export function TicketCard({
                               movie,
                               index,
                               isSyncing,
                               onToggleWatched,
                               onToggleSeason,
                               onSetRatingState,
                               onUpdateNote,
                               onSyncSingle,
                               onDelete,
                           }) {
    const [expanded, setExpanded] = useState(false);
    const [editingNote, setEditingNote] = useState(false);
    const [noteDraft, setNoteDraft] = useState(movie.note || '');
    const [confirmDelete, setConfirmDelete] = useState(false);

    const handleSaveNote = async () => {
        await onUpdateNote(movie.id, noteDraft.trim());
        setEditingNote(false);
    };

    const totalSeasons = movie.total_seasons || 1;
    const releasedSeasons = movie.released_seasons ?? 1;
    const watchedSeasons = movie.watched_seasons || [];
    const hasNewUnwatchedSeason =
        movie.media_type === 'tv' &&
        watchedSeasons.length > 0 &&
        watchedSeasons.length < releasedSeasons;

    return (
        <div className="bg-zinc-900 border border-amber-500/30 flex flex-col sm:flex-row overflow-hidden shadow-[4px_4px_0px_0px_#78350f] hover:border-amber-400 transition">
            {/* BAL OLDALI ELLENŐRZŐSZELVÉNY (STUB) */}
            <div className="w-full sm:w-36 bg-zinc-950 p-3 flex flex-col justify-between items-center border-b sm:border-b-0 sm:border-r border-dashed border-amber-500/40 relative flex-shrink-0">
                <div className="relative">
                    <img
                        src={
                            movie.poster_path
                                ? `https://image.tmdb.org/t/p/w300${movie.poster_path}`
                                : 'https://placehold.co/200x300/18181b/f59e0b?text=NO+POSTER'
                        }
                        alt={movie.title}
                        className="w-24 h-36 object-cover border border-zinc-800 shadow"
                    />
                    {hasNewUnwatchedSeason && (
                        <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 uppercase tracking-wider shadow">
              ÚJ ÉVAD!
            </span>
                    )}
                </div>

                <div className="text-center mt-2">
          <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest block">
            {movie.media_type === 'tv' ? 'SOROZAT' : 'FILM'}
          </span>
                    <div className="text-[10px] text-zinc-500">
                        SEAT: A-{String(index + 1).padStart(2, '0')}
                    </div>
                </div>

                <div className="w-full text-center text-[8px] text-zinc-600 tracking-[0.25em] border-t border-zinc-800 pt-1 mt-1">
                    ||| | |||| || |||
                </div>
            </div>

            {/* JOBB OLDALI JEGYTEST */}
            <div className="flex-1 p-4 flex flex-col justify-between gap-3">
                <div>
                    {/* Fejléc: Cím + Értékelés + Egyedi Sync + Törlés */}
                    <div className="flex justify-between items-start gap-2">
                        <h3 className="font-bold text-base text-amber-100 leading-snug">
                            {movie.title}
                        </h3>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-xs bg-amber-400 text-black px-1.5 py-0.5 font-bold">
                ★ {movie.vote_average || 'N/A'}
              </span>

                            {/* Egyedi TMDB frissítő gomb */}
                            <button
                                onClick={() => onSyncSingle(movie)}
                                disabled={isSyncing}
                                title="Adatok és évadok frissítése TMDB-ből"
                                className="p-1 text-zinc-400 hover:text-amber-300 border border-zinc-800 hover:border-amber-500/40 transition disabled:opacity-50"
                            >
                                <RefreshCw
                                    className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-400' : ''}`}
                                />
                            </button>

                            {/* Törlés gomb */}
                            {!confirmDelete ? (
                                <button
                                    onClick={() => setConfirmDelete(true)}
                                    title="Törlés"
                                    className="p-1 text-zinc-500 hover:text-red-400 border border-zinc-800 hover:border-red-900/50 transition"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            ) : (
                                <button
                                    onClick={() => onDelete(movie.id)}
                                    className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold uppercase"
                                >
                                    Töröl!
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="text-[10px] text-zinc-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span>YEAR: {movie.release_year || '—'}</span>
                        <span>// ID: {movie.imdb_id}</span>
                        {movie.series_status && (
                            <span className="text-amber-400/80">
                // {movie.series_status.toUpperCase()}
              </span>
                        )}
                    </div>

                    {/* Következő premier / évad dátum jelvény */}
                    {movie.next_air_date && (
                        <div className="mt-1.5 inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] px-2 py-0.5">
                            <Calendar className="w-3 h-3" />
                            <span>Következő premier: {movie.next_air_date}</span>
                        </div>
                    )}

                    {/* Műfajok */}
                    <div className="flex flex-wrap gap-1 my-2">
                        {(movie.genres || []).map((g) => (
                            <span
                                key={g}
                                className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-amber-200/90 border border-zinc-700"
                            >
                {g}
              </span>
                        ))}
                    </div>

                    {/* Sorozat évad-választó gombok */}
                    {movie.media_type === 'tv' && (
                        <div className="my-2 p-2 bg-zinc-950/80 border border-zinc-800">
                            <div className="text-[9px] text-zinc-400 uppercase tracking-wider mb-1.5">
                                Évadok ({watchedSeasons.length}/{releasedSeasons} megjelent látva):
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {Array.from({ length: totalSeasons }, (_, i) => i + 1).map(
                                    (sNum) => {
                                        const isReleased = sNum <= releasedSeasons;
                                        const isChecked = watchedSeasons.includes(sNum);

                                        if (!isReleased) {
                                            return (
                                                <span
                                                    key={sNum}
                                                    title="Még nem jelent meg"
                                                    className="text-[10px] px-2 py-0.5 bg-zinc-900 text-zinc-600 border border-dashed border-zinc-800 cursor-not-allowed"
                                                >
                          S{sNum} ⏳
                        </span>
                                            );
                                        }

                                        return (
                                            <button
                                                key={sNum}
                                                onClick={() => onToggleSeason(movie, sNum)}
                                                className={`text-[10px] px-2 py-0.5 font-bold border transition ${
                                                    isChecked
                                                        ? 'bg-amber-400 text-black border-amber-400'
                                                        : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-amber-400'
                                                }`}
                                            >
                                                {isChecked ? `✓ S${sNum}` : `S${sNum}`}
                                            </button>
                                        );
                                    }
                                )}
                            </div>
                        </div>
                    )}

                    {/* Angol leírás (lenyitható) */}
                    <p
                        className={`text-xs text-zinc-400 leading-relaxed ${
                            expanded ? '' : 'line-clamp-2'
                        }`}
                    >
                        {movie.overview}
                    </p>
                    {movie.overview && movie.overview.length > 110 && (
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="text-[10px] text-amber-400 hover:underline mt-0.5"
                        >
                            {expanded ? '▲ Kevesebb' : '▼ Tovább'}
                        </button>
                    )}

                    {/* Saját megjegyzés (Note) */}
                    <div className="mt-2">
                        {editingNote ? (
                            <div className="flex gap-1.5 mt-1">
                                <input
                                    type="text"
                                    value={noteDraft}
                                    onChange={(e) => setNoteDraft(e.target.value)}
                                    placeholder="Pl. 2027 nyarán jön a 4. évad..."
                                    className="flex-1 bg-zinc-950 border border-amber-500/50 px-2 py-1 text-[11px] text-amber-100 focus:outline-none"
                                />
                                <button
                                    onClick={handleSaveNote}
                                    className="px-2 py-1 bg-amber-400 text-black text-[10px] font-bold flex items-center gap-1"
                                >
                                    <Check className="w-3 h-3" /> OK
                                </button>
                            </div>
                        ) : (
                            <div
                                onClick={() => {
                                    setNoteDraft(movie.note || '');
                                    setEditingNote(true);
                                }}
                                className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-amber-300 cursor-pointer mt-1"
                            >
                                <StickyNote className="w-3 h-3 text-amber-500/70" />
                                {movie.note ? (
                                    <span className="italic text-amber-200/90">"{movie.note}"</span>
                                ) : (
                                    <span className="text-[10px] underline decoration-dashed">
                    + Megjegyzés hozzáadása
                  </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* LÁBLÉC: TRAILER + STÁTUSZ + 3-ÁLLAPOTÚ ÉRTÉKELÉS (👍 / 😐 / 👎) */}
                <div className="pt-2.5 border-t border-dashed border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <a
                        href={movie.trailer_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-400 hover:underline flex items-center gap-1 text-[11px] font-bold"
                    >
                        <Play className="w-3 h-3" /> TRAILER
                    </a>

                    <div className="flex items-center gap-1.5">
                        {movie.watched && (
                            <div className="flex items-center gap-1 mr-1">
                                <button
                                    onClick={() => onSetRatingState(movie, 'liked')}
                                    title="Tetszett"
                                    className={`p-1.5 border transition ${
                                        movie.rating_state === 'liked'
                                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-200'
                                    }`}
                                >
                                    <ThumbsUp className="w-3.5 h-3.5" />
                                </button>

                                <button
                                    onClick={() => onSetRatingState(movie, 'meh')}
                                    title="Meh (egyszer nézős)"
                                    className={`p-1.5 border transition ${
                                        movie.rating_state === 'meh'
                                            ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-200'
                                    }`}
                                >
                                    <Meh className="w-3.5 h-3.5" />
                                </button>

                                <button
                                    onClick={() => onSetRatingState(movie, 'disliked')}
                                    title="Nem tetszett"
                                    className={`p-1.5 border transition ${
                                        movie.rating_state === 'disliked'
                                            ? 'bg-red-500/20 border-red-400 text-red-300'
                                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-200'
                                    }`}
                                >
                                    <ThumbsDown className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}

                        <button
                            onClick={() => onToggleWatched(movie)}
                            className={`text-[10px] px-2.5 py-1 font-bold uppercase border transition ${
                                movie.watched
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-600'
                            }`}
                        >
                            {movie.watched ? 'ÉRVÉNYESÍTVE' : '[MEGNÉZTÜK]'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
