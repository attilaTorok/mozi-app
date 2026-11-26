import React, { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { extractImdbId, fetchByImdbId } from '../lib/tmdb';

export default function AddByImdb({ onAddMovie }) {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');

        const imdbId = extractImdbId(input);
        if (!imdbId) {
            setError('Érvénytelen IMDb link vagy azonosító! (Pl. tt0816692)');
            return;
        }

        setLoading(true);
        try {
            const movieData = await fetchByImdbId(imdbId);
            await onAddMovie(movieData);
            setInput('');
            setSuccessMsg(`Hozzáadva: ${movieData.title}`);
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err) {
            setError(err.message || 'Hiba történt a hozzáadás során.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-2">
            <form
                onSubmit={handleSubmit}
                className="bg-zinc-900 border border-zinc-800 p-2 flex flex-col sm:flex-row gap-2"
            >
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="IMDb link vagy azonosító (pl. https://www.imdb.com/title/tt0816692/)..."
                    className="flex-1 bg-zinc-950 border border-zinc-700 px-4 py-2.5 text-xs text-amber-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400"
                />
                <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-black px-6 py-2.5 text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-[3px_3px_0px_0px_#78350f]"
                >
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Plus className="w-4 h-4" />
                    )}
                    {loading ? 'KERESÉS...' : 'HOZZÁAD'}
                </button>
            </form>

            {error && (
                <div className="text-xs text-red-400 bg-red-950/50 border border-red-800 px-3 py-2">
                    {error}
                </div>
            )}
            {successMsg && (
                <div className="text-xs text-emerald-400 bg-emerald-950/50 border border-emerald-800 px-3 py-2">
                    ✓ {successMsg}
                </div>
            )}
        </div>
    );
}
