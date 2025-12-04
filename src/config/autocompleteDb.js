import mongoose from 'mongoose';
import Autocljob from '../models/tmp/Autocjob.js';
import config  from '../config/index.js';

/**
 * Separate MongoDB connection for autocomplete feature
 * Uses different database to avoid Atlas Search index limits (max 3)
 */

const AUTOCOMPLETE_DB_URI = config.AUTOCOMPLETE_DB_URI;

let autocompleteConnection = null;
let AutocompleteJob = null;

/**
 * Connect to autocomplete database
 * @returns {Promise<mongoose.Connection>}
 */
export const connectAutocompleteDB = async () => {
  if (autocompleteConnection && autocompleteConnection.readyState === 1) {
    return autocompleteConnection;
  }

  try {
    autocompleteConnection = mongoose.createConnection(AUTOCOMPLETE_DB_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    autocompleteConnection.on('connected', () => {
      console.log('✅ Autocomplete MongoDB Connected');
    });

    autocompleteConnection.on('error', (err) => {
      console.error('❌ Autocomplete MongoDB Error:', err.message);
    });

    // Register Job model on this connection
    AutocompleteJob = autocompleteConnection.model('Autocljobs', Autocljob.schema);

    return autocompleteConnection;
  } catch (error) {
    console.error('❌ Failed to connect Autocomplete DB:', error.message);
    throw error;
  }
};

/**
 * Get Job model from autocomplete database
 * @returns {Promise<mongoose.Model>}
 */
export const getAutocompleteJobModel = async () => {
  if (!AutocompleteJob) {
    await connectAutocompleteDB();
  }
  return AutocompleteJob;
};

export { autocompleteConnection, AutocompleteJob };
