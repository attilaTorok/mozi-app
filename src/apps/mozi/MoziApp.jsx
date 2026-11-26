import React, { useState } from 'react';
import { Film, Ticket, RefreshCw } from 'lucide-react';
import AddByImdb from './components/AddByImdb';
import { FilterBar } from './components/FilterBar';
import { TicketCard } from './components/TicketCard';
import { RouletteModal } from './components/RouletteModal';
import { useMovies } from './hooks/useMovies';
import { useFilters } from './hooks/useFilters';

export default function MoziApp() {
    const [isRouletteOpen, setIsRouletteOpen] = useState(false);

    const {
        movies,
        loading,
        syncingIds,
        bulkSyncing,
        addMovie,
        toggleWatched,
        toggleSeason,
        setRatingState,
        updateNote,
        deleteMovie,
        syncSingleMovie,
        syncAllMovies,
    } = useMovies();

    const {
        mediaType,
        setMediaType,
        statusTab,
        setStatusTab,
        selectedGenre,
        setSelectedGenre,
        searchQuery,
        setSearchQuery,
        availableGenres,
        filteredMovies,
    } = useFilters(movies);

    return (
        <div className="min-h-screen bg-zinc-950 text-amber-100 font-mono pb-24">
            <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
                {/* FEJLÉC */}
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-5">
                    <div className="flex items-center gap-3">
                        <Film className="w-7 h-7 text-amber-400" />
                        <h1 className="text-2xl sm:text-3xl font-black tracking-widest text-amber-400">
                            KUPON MOZI
                        </h1>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Tömeges frissítés angolra és évadok lekérése */}
                        <button
                            onClick={syncAllMovies}
                            disabled={bulkSyncing}
                            title="Minden mentett film/sorozat frissítése angolra és legújabb évadokra"
                            className="px-3.5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-500/40 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition disabled:opacity-50"
                        >
                            <RefreshCw
                                className={`w-4 h-4 ${bulkSyncing ? 'animate-spin' : ''}`}
                            />
                            {bulkSyncing ? 'FRISSÍTÉS...' : 'TMDB SYNC (ALL)'}
                        </button>

                        <button
                            onClick={() => setIsRouletteOpen(true)}
                            className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase tracking-wider shadow-[4px_4px_0px_0px_#78350f] active:translate-x-1 active:translate-y-1 transition flex items-center gap-2"
                        >
                            <Ticket className="w-4 h-4" />
                            JEGYHÚZÁS / SORSOLÁS
                        </button>
                    </div>
                </header>

                {/* HOZZÁADÁS IMDb LINKKEL */}
                <AddByImdb onAddMovie={addMovie} />

                {/* SZŰRŐK */}
                <FilterBar
                    movies={movies}
                    mediaType={mediaType}
                    setMediaType={setMediaType}
                    statusTab={statusTab}
                    setStatusTab={setStatusTab}
                    selectedGenre={selectedGenre}
                    setSelectedGenre={setSelectedGenre}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    availableGenres={availableGenres}
                />

                {loading ? (
                    <div className="text-center py-16 text-xs text-amber-400 animate-pulse">
                        ADATBÁZIS BETÖLTÉSE...
                    </div>
                ) : filteredMovies.length === 0 ? (
                    <div className="border border-dashed border-zinc-800 p-12 text-center text-xs text-zinc-500">
                        Nincs találat ezen a fülön. Adj hozzá egy filmet az IMDb linkjével!
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {filteredMovies.map((movie, index) => (
                            <TicketCard
                                key={movie.id}
                                movie={movie}
                                index={index}
                                isSyncing={syncingIds.includes(movie.id)}
                                onToggleWatched={toggleWatched}
                                onToggleSeason={toggleSeason}
                                onSetRatingState={setRatingState}
                                onUpdateNote={updateNote}
                                onSyncSingle={syncSingleMovie}
                                onDelete={deleteMovie}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* SORSOLÓ MODÁL */}
            <RouletteModal
                isOpen={isRouletteOpen}
                onClose={() => setIsRouletteOpen(false)}
                movies={movies}
                onAddMovie={addMovie}
            />
        </div>
    );
}
