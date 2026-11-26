import { config } from './config';

const BASE_URL = 'https://api.themoviedb.org/3';

export function extractImdbId(input) {
    if (!input) return null;
    const match = input.trim().match(/tt\d+/i);
    return match ? match[0].toLowerCase() : null;
}

function computeSeasonStats(details) {
    if (!details.seasons) {
        return {
            total_seasons: 1,
            released_seasons: 1,
            series_status: null,
            next_air_date: null,
        };
    }

    const today = new Date().toISOString().split('T')[0];
    // Kiszűrjük a "Specials" (Season 0) évadot
    const regularSeasons = details.seasons.filter((s) => s.season_number > 0);
    const total_seasons = regularSeasons.length || details.number_of_seasons || 1;

    // Csak azok az évadok számítanak megjelentnek, amelyeknek van air_date-je és az <= ma
    const released = regularSeasons.filter(
        (s) => s.air_date && s.air_date <= today
    );
    const released_seasons = released.length;

    const nextAirDate =
        details.next_episode_to_air?.air_date ||
        regularSeasons.find((s) => s.air_date && s.air_date > today)?.air_date ||
        null;

    return {
        total_seasons,
        released_seasons,
        series_status: details.status || null,
        next_air_date: nextAirDate,
    };
}

export async function fetchMediaDetailsByTmdb(tmdbId, mediaType) {
    const apiKey = config.tmdbApiKey;
    if (!apiKey) throw new Error('Hiányzik a TMDB API kulcs!');

    const detailsRes = await fetch(
        `${BASE_URL}/${mediaType}/${tmdbId}?api_key=${apiKey}&language=en-US&append_to_response=videos,external_ids`
    );
    if (!detailsRes.ok) throw new Error('Nem sikerült lekérni a részleteket.');
    const details = await detailsRes.json();

    const title = mediaType === 'tv' ? details.name : details.title;
    const releaseDate =
        mediaType === 'tv' ? details.first_air_date : details.release_date;
    const releaseYear = releaseDate
        ? parseInt(releaseDate.substring(0, 4), 10)
        : null;

    const genres = (details.genres || []).map((g) => g.name);

    // Trailer keresés
    const videos = details.videos?.results || [];
    const trailer =
        videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
        videos.find((v) => v.site === 'YouTube');

    const trailerUrl = trailer
        ? `https://www.youtube.com/watch?v=${trailer.key}`
        : `https://www.youtube.com/results?search_query=${encodeURIComponent(
            `${title} official trailer`
        )}`;

    const seasonStats =
        mediaType === 'tv'
            ? computeSeasonStats(details)
            : {
                total_seasons: 1,
                released_seasons:
                    releaseDate && releaseDate > new Date().toISOString().split('T')[0]
                        ? 0
                        : 1,
                series_status: null,
                next_air_date:
                    releaseDate && releaseDate > new Date().toISOString().split('T')[0]
                        ? releaseDate
                        : null,
            };

    return {
        imdb_id: details.external_ids?.imdb_id || null,
        tmdb_id: details.id,
        title,
        media_type: mediaType,
        poster_path: details.poster_path,
        overview: details.overview || 'No description available.',
        vote_average: details.vote_average
            ? Math.round(details.vote_average * 10) / 10
            : 0,
        genres,
        trailer_url: trailerUrl,
        release_year: releaseYear,
        ...seasonStats,
    };
}

export async function fetchByImdbId(imdbId) {
    const apiKey = config.tmdbApiKey;
    if (!apiKey) throw new Error('Hiányzik a TMDB API kulcs!');

    const findRes = await fetch(
        `${BASE_URL}/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`
    );
    if (!findRes.ok) throw new Error('TMDB keresési hiba.');
    const findData = await findRes.json();

    let mediaType = null;
    let match = null;

    if (findData.movie_results?.length > 0) {
        mediaType = 'movie';
        match = findData.movie_results[0];
    } else if (findData.tv_results?.length > 0) {
        mediaType = 'tv';
        match = findData.tv_results[0];
    } else {
        throw new Error('Nem található film vagy sorozat ezzel az IMDb azonosítóval.');
    }

    const data = await fetchMediaDetailsByTmdb(match.id, mediaType);
    return {
        ...data,
        imdb_id: imdbId,
    };
}

export async function discoverRandomMedia(mediaType = 'movie', excludeTmdbIds = []) {
    const apiKey = config.tmdbApiKey;
    const randomPage = Math.floor(Math.random() * 15) + 1;

    const res = await fetch(
        `${BASE_URL}/discover/${mediaType}?api_key=${apiKey}&language=en-US&sort_by=popularity.desc&vote_count.gte=300&page=${randomPage}`
    );
    if (!res.ok) throw new Error('TMDB Discover hiba.');
    const data = await res.json();

    const candidates = (data.results || []).filter(
        (item) => !excludeTmdbIds.includes(item.id)
    );
    const shuffled = candidates.sort(() => 0.5 - Math.random()).slice(0, 3);

    return Promise.all(
        shuffled.map((item) => fetchMediaDetailsByTmdb(item.id, mediaType))
    );
}

export async function discoverBasedOnLiked(likedMovies = [], excludeTmdbIds = []) {
    const apiKey = config.tmdbApiKey;
    if (!likedMovies.length) {
        throw new Error('Nincs még "Tetszett" jelölésű filmed vagy sorozatod!');
    }

    // Véletlenszerűen kiválasztunk egyet a kedvencekből
    const seed = likedMovies[Math.floor(Math.random() * likedMovies.length)];

    const res = await fetch(
        `${BASE_URL}/${seed.media_type}/${seed.tmdb_id}/recommendations?api_key=${apiKey}&language=en-US&page=1`
    );
    if (!res.ok) throw new Error('TMDB ajánló lekérési hiba.');
    const data = await res.json();

    const candidates = (data.results || []).filter(
        (item) => !excludeTmdbIds.includes(item.id)
    );
    const shuffled = candidates.sort(() => 0.5 - Math.random()).slice(0, 3);

    const detailed = await Promise.all(
        shuffled.map((item) =>
            fetchMediaDetailsByTmdb(item.id, item.media_type || seed.media_type)
        )
    );

    return {
        seedTitle: seed.title,
        items: detailed,
    };
}
