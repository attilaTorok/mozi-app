import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fetchMediaDetailsByTmdb } from '../lib/tmdb';

export function useMovies(isAuthenticated) {
    const [movies, setMovies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncingIds, setSyncingIds] = useState([]);
    const [bulkSyncing, setBulkSyncing] = useState(false);
    const [error, setError] = useState(null);

    const showError = (err, fallbackMsg) => {
        const msg = err?.message || fallbackMsg || 'Ismeretlen adatbázis hiba.';
        setError(msg);
        setTimeout(() => {
            setError((prev) => (prev === msg ? null : prev));
        }, 8000);
    };

    const fetchMovies = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            setLoading(true);
            const { data, error: sbError } = await supabase
                .from('movies')
                .select('*')
                .order('created_at', { ascending: false });

            if (sbError) throw sbError;
            setMovies(data || []);
        } catch (err) {
            showError(err, 'Nem sikerült betölteni a listát.');
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        fetchMovies();

        if (!isAuthenticated) return;
        const channel = supabase
            .channel('movies-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'movies' },
                () => {
                    fetchMovies();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isAuthenticated, fetchMovies]);

    const addMovie = async (movieData) => {
        const exists = movies.some(
            (m) => m.imdb_id === movieData.imdb_id || m.tmdb_id === movieData.tmdb_id
        );
        if (exists) {
            throw new Error('Ez a tétel már szerepel a gyűjteményben!');
        }

        const payload = {
            ...movieData,
            watched: false,
            rating_state: null,
            watched_seasons: [],
            note: '',
        };

        const { data, error: sbError } = await supabase
            .from('movies')
            .insert([payload])
            .select()
            .single();

        if (sbError) {
            showError(sbError, 'Mentési hiba a Supabase-be.');
            throw sbError;
        }
        setMovies((prev) => [data, ...prev]);
        return data;
    };

    const toggleWatched = async (movie) => {
        try {
            const nextWatched = !movie.watched;
            let nextSeasons = movie.watched_seasons || [];

            if (movie.media_type === 'tv') {
                if (nextWatched) {
                    const count = movie.released_seasons || 1;
                    nextSeasons = Array.from({ length: count }, (_, i) => i + 1);
                } else {
                    nextSeasons = [];
                }
            }

            const updates = {
                watched: nextWatched,
                watched_seasons: nextSeasons,
                rating_state: nextWatched ? movie.rating_state : null,
            };

            const { error: sbError } = await supabase
                .from('movies')
                .update(updates)
                .eq('id', movie.id);

            if (sbError) throw sbError;
            setMovies((prev) =>
                prev.map((m) => (m.id === movie.id ? { ...m, ...updates } : m))
            );
        } catch (err) {
            showError(err, 'Nem sikerült módosítani a státuszt.');
        }
    };

    const toggleSeason = async (movie, seasonNum) => {
        try {
            const current = movie.watched_seasons || [];
            const exists = current.includes(seasonNum);
            const nextSeasons = exists
                ? current.filter((s) => s !== seasonNum)
                : [...current, seasonNum].sort((a, b) => a - b);

            const releasedCount = movie.released_seasons || 1;
            const allReleasedWatched =
                releasedCount > 0 && nextSeasons.length >= releasedCount;

            const updates = {
                watched_seasons: nextSeasons,
                watched: allReleasedWatched,
            };

            const { error: sbError } = await supabase
                .from('movies')
                .update(updates)
                .eq('id', movie.id);

            if (sbError) throw sbError;
            setMovies((prev) =>
                prev.map((m) => (m.id === movie.id ? { ...m, ...updates } : m))
            );
        } catch (err) {
            showError(err, 'Nem sikerült frissíteni az évadot.');
        }
    };

    const setRatingState = async (movie, newState) => {
        try {
            const finalState = movie.rating_state === newState ? null : newState;
            const { error: sbError } = await supabase
                .from('movies')
                .update({ rating_state: finalState })
                .eq('id', movie.id);

            if (sbError) throw sbError;
            setMovies((prev) =>
                prev.map((m) =>
                    m.id === movie.id ? { ...m, rating_state: finalState } : m
                )
            );
        } catch (err) {
            showError(err, 'Nem sikerült menteni az értékelést.');
        }
    };

    const updateNote = async (movieId, noteText) => {
        try {
            const { error: sbError } = await supabase
                .from('movies')
                .update({ note: noteText })
                .eq('id', movieId);

            if (sbError) throw sbError;
            setMovies((prev) =>
                prev.map((m) => (m.id === movieId ? { ...m, note: noteText } : m))
            );
        } catch (err) {
            showError(err, 'Nem sikerült menteni a megjegyzést.');
        }
    };

    const deleteMovie = async (movieId) => {
        try {
            const { error: sbError } = await supabase
                .from('movies')
                .delete()
                .eq('id', movieId);

            if (sbError) throw sbError;
            setMovies((prev) => prev.filter((m) => m.id !== movieId));
        } catch (err) {
            showError(err, 'Nem sikerült törölni a tételt.');
        }
    };

    const syncSingleMovie = async (movie) => {
        setSyncingIds((prev) => [...prev, movie.id]);
        try {
            const fresh = await fetchMediaDetailsByTmdb(
                movie.tmdb_id,
                movie.media_type
            );

            const watchedSeasons = movie.watched_seasons || [];
            const stillAllWatched =
                movie.media_type === 'tv'
                    ? fresh.released_seasons > 0 &&
                    watchedSeasons.length >= fresh.released_seasons
                    : movie.watched;

            const updates = {
                title: fresh.title,
                overview: fresh.overview,
                genres: fresh.genres,
                poster_path: fresh.poster_path,
                vote_average: fresh.vote_average,
                trailer_url: fresh.trailer_url,
                release_year: fresh.release_year,
                total_seasons: fresh.total_seasons,
                released_seasons: fresh.released_seasons,
                series_status: fresh.series_status,
                next_air_date: fresh.next_air_date,
                watched: stillAllWatched,
            };

            const { error: sbError } = await supabase
                .from('movies')
                .update(updates)
                .eq('id', movie.id);

            if (sbError) throw sbError;
            setMovies((prev) =>
                prev.map((m) => (m.id === movie.id ? { ...m, ...updates } : m))
            );
        } catch (err) {
            showError(err, `Frissítési hiba (${movie.title}).`);
        } finally {
            setSyncingIds((prev) => prev.filter((id) => id !== movie.id));
        }
    };

    const syncAllMovies = async () => {
        if (bulkSyncing || movies.length === 0) return;
        setBulkSyncing(true);
        try {
            for (const m of movies) {
                await syncSingleMovie(m);
            }
        } finally {
            setBulkSyncing(false);
        }
    };

    return {
        movies,
        loading,
        error,
        clearError: () => setError(null),
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
    };
}
