import { getAutocompleteJobModel } from '../config/autocompleteDb.js';
import logger from '../utils/logger.js';

/**
 * Autocomplete job titles using separate database with Atlas Search
 * @param {string} query - Search query
 * @param {number} limit - Maximum results (default: 10)
 * @returns {Promise<Array>} Array of suggestions
 */
export const autocompleteJobTitles = async (query, limit = 10) => {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const trimmedQuery = query.trim();

  try {
    const Job = await getAutocompleteJobModel();

    // MongoDB Atlas Search autocomplete aggregation
    const results = await Job.aggregate([
      {
        $search: {
          index: 'autocl', // Atlas Search autocomplete index
          compound: {
            must: [
              {
                autocomplete: {
                  query: trimmedQuery,
                  path: 'title',
                  fuzzy: {
                    maxEdits: 1
                  }
                }
              }
            ]
          }
        }
      },
      {
        $project: {
          title: 1,
          score: { $meta: 'searchScore' },
          isPrefixMatch: {
            $regexMatch: {
              input: { $toLower: '$title' },
              regex: `^${trimmedQuery.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
              options: 'i'
            }
          }
        }
      },
      {
        $group: {
          _id: '$title',
          score: { $max: '$score' },
          isPrefixMatch: { $max: '$isPrefixMatch' }
        }
      },
      {
        $project: {
          _id: 0,
          title: '$_id',
          score: 1,
          isPrefixMatch: 1
        }
      },
      {
        $sort: {
          isPrefixMatch: -1,
          score: -1
        }
      },
      {
        $limit: limit
      }
    ]);

    return results.map(r => ({
      title: r.title,
      score: r.score,
      isPrefixMatch: r.isPrefixMatch
    }));

  } catch (error) {
    logger.error('Autocomplete error:', { query, error: error.message });
    console.error('Autocomplete failed:', error.message);
    
    // Fallback to regex search
    return fallbackAutocomplete(query, limit);
  }
};

/**
 * Fallback autocomplete using regex (when Atlas Search fails)
 */
const fallbackAutocomplete = async (query, limit = 10) => {
  const trimmedQuery = query.trim();
  const escapedQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    const Job = await getAutocompleteJobModel();

    const results = await Job.aggregate([
      {
        $match: {
          status: 'ACTIVE',
          moderationStatus: 'APPROVED',
          title: { $regex: escapedQuery, $options: 'i' }
        }
      },
      {
        $project: {
          title: 1,
          isPrefixMatch: {
            $regexMatch: {
              input: { $toLower: '$title' },
              regex: `^${escapedQuery.toLowerCase()}`,
              options: 'i'
            }
          }
        }
      },
      {
        $group: {
          _id: '$title',
          isPrefixMatch: { $max: '$isPrefixMatch' }
        }
      },
      {
        $project: {
          _id: 0,
          title: '$_id',
          score: 1,
          isPrefixMatch: 1
        }
      },
      {
        $sort: { isPrefixMatch: -1, title: 1 }
      },
      {
        $limit: limit
      }
    ]);

    return results.map(r => ({
      title: r.title,
      score: r.score || 1,
      isPrefixMatch: r.isPrefixMatch
    }));

  } catch (error) {
    logger.error('Fallback autocomplete error:', { query, error: error.message });
    return [];
  }
};

export default { autocompleteJobTitles };
