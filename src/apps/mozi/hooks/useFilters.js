import { useState, useMemo } from 'react';

export function isUpcomingItem(movie) {
    if (movie.media_type === 'movie') {
        return movie.released_seasons === 0 && !movie.watched;
    }
    // Sorozat: akkor kerül a Hamarosan/Várólista fülre, ha még 1 évad sem jött ki,
    // VAGY az összes eddig megjelent évadot láttuk, DE a sorozat még fut ('Returning Series')
    const watchedCount = (movie.watched_seasons || []).length;
    const releasedCount = movie.released_seasons || 0;

    if (releasedCount === 0) return true;
    if (
        watchedCount >= releasedCount &&
        movie.series_status === 'Returning Series'
    ) {
        return true;
    }
    return false;
}

export function isWatchlistItem(movie) {
    if (movie.media_type === 'movie') {
        return !movie.watched && movie.released_seasons !== 0;
    }
    // Sorozat: van legalább 1 már megjelent évad, amit még nem láttak
    const watchedCount = (movie.watched_seasons || []).length;
    const releasedCount = movie.released_seasons || 1;
    return releasedCount > 0 && watchedCount < releasedCount;
}

export function useFilters(movies) {
    const [mediaType, setMediaType] = useState('all'); // 'all' | 'movie' | 'tv'
    const [statusTab, setStatusTab] = useState('watchlist'); // 'watchlist' | 'watched' | 'upcoming'
    const [selectedGenre, setSelectedGenre] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    const availableGenres = useMemo(() => {
        const genreSet = new Set();
        movies.forEach((m) => {
            (m.genres || []).forEach((g) => genreSet.add(g));
        });
        return Array.from(genreSet).sort();
    }, [movies]);

    const filteredMovies = useMemo(() => {
        return movies.filter((m) => {
            // Státusz tab szűrés
            if (statusTab === 'watchlist' && !isWatchlistItem(m)) return false;
            if (statusTab === 'upcoming' && !isUpcomingItem(m)) return false;
            if (statusTab === 'watched') {
                if (m.media_type === 'movie' && !m.watched) return false;
                if (m.media_type === 'tv') {
                    const watchedCount = (m.watched_seasons || []).length;
                    const releasedCount = m.released_seasons || 1;
                    if (releasedCount === 0 || watchedCount < releasedCount) return false;
                }
            }

            // Típus szűrés
            if (mediaType !== 'all' && m.media_type !== mediaType) return false;

            // Műfaj szűrés
            if (
                selectedGenre !== 'all' &&
                !(m.genres || []).includes(selectedGenre)
            ) {
                return false;
            }

            // Keresés
            if (searchQuery.trim() !== '') {
                const q = searchQuery.toLowerCase();
                const inTitle = m.title?.toLowerCase().includes(q);
                const inNote = m.note?.toLowerCase().includes(q);
                if (!inTitle && !inNote) return false;
            }

            return true;
        });
    }, [movies, mediaType, statusTab, selectedGenre, searchQuery]);

    return {
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
    };
}
