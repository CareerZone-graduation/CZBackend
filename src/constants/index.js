import locationsData from './locations.json' assert { type: 'json' };

const allCities = locationsData.cities.map(city => city.name);
const allDistricts = locationsData.cities.flatMap(city => city.districts);

export const LOCATIONS = {
    CITIES: allCities,
    DISTRICTS: allDistricts,
    DATA: locationsData.cities,
};

// You can add other constants here as the application grows
