const City = require('../models/City');
const { getPaginationParams } = require('../utils/pagination');
const { formatCityForUser } = require('../utils/responseFormatter');
exports.addCity = async (req, res) => {
  try {
    const { name, country, isActive = true, isDefault = false, meta } = req.body;
    if (isDefault) {
      await City.updateMany({ country }, { $set: { isDefault: false } });
    }
    const city = await City.create({ name, country, isActive, isDefault, meta });
    res.status(201).json({ message: 'City created', city });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'City already exists for this country' });
    res.status(500).json({ message: error.message });
  }
};
exports.getAllCitiesAdmin = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req, 20);
    const search = req.query.search || '';
    const country = req.query.country;
    const isActive = req.query.isActive;
    const query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    if (country) query.country = country;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    const total = await City.countDocuments(query);
    const cities = await City.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    res.status(200).json({
      cities,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getCityById = async (req, res) => {
  try {
    const city = await City.findById(req.params.id);
    if (!city) return res.status(404).json({ message: 'City not found' });
    res.status(200).json(city);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateCity = async (req, res) => {
  try {
    const { name, country, isActive, isDefault, meta } = req.body;
    if (isDefault) await City.updateMany({ country }, { $set: { isDefault: false } });
    const updated = await City.findByIdAndUpdate(req.params.id, { name, country, isActive, isDefault, meta }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'City not found' });
    res.status(200).json({ message: 'City updated', city: updated });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'City already exists for this country' });
    res.status(500).json({ message: error.message });
  }
};
exports.deleteCity = async (req, res) => {
  try {
    const deleted = await City.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'City not found' });
    res.status(200).json({ message: 'City deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getPublicCities = async (req, res) => {
  try {
    const country = req.query.country;
    const query = { isActive: true };
    if (country) query.country = country;
    const cities = await City.find(query).sort({ name: 1 });
    const formattedCities = cities.map(c => formatCityForUser(c));
    res.status(200).json(formattedCities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.addZone = async (req, res) => {
  try {
    const { cityId } = req.params;
    const { name, isActive = true, deliveryCharges = [], polygon, center, meta } = req.body;
    const city = await City.findById(cityId);
    if (!city) return res.status(404).json({ message: 'City not found' });
    city.zones.push({ name, isActive, deliveryCharges, polygon, center, meta, createdBy: req.user._id });
    await city.save();
    res.status(201).json({ message: 'Zone added', zone: city.zones[city.zones.length - 1] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getZonesByCityAdmin = async (req, res) => {
  try {
    const { cityId } = req.params;
    const search = req.query.search || '';
    const city = await City.findById(cityId).select('zones name country');
    if (!city) return res.status(404).json({ message: 'City not found' });
    let zones = city.zones || [];
    if (search) zones = zones.filter(z => z.name.toLowerCase().includes(search.toLowerCase()));
    res.status(200).json({ city: { _id: city._id, name: city.name }, zones });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getZoneById = async (req, res) => {
  try {
    const { id } = req.params; // zone id
    const city = await City.findOne({ 'zones._id': id }, { 'zones.$': 1, name: 1 });
    if (!city || !city.zones || city.zones.length === 0) return res.status(404).json({ message: 'Zone not found' });
    const zone = city.zones[0];
    res.status(200).json({ city: { _id: city._id, name: city.name }, zone });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateZone = async (req, res) => {
  try {
    const { id } = req.params; // zone id
    const { name, isActive, deliveryCharges, polygon, center, meta } = req.body;
    const city = await City.findOne({ 'zones._id': id });
    if (!city) return res.status(404).json({ message: 'Zone not found' });
    const zone = city.zones.id(id);
    if (!zone) return res.status(404).json({ message: 'Zone not found' });
    if (name !== undefined) zone.name = name;
    if (isActive !== undefined) zone.isActive = isActive;
    if (deliveryCharges !== undefined) zone.deliveryCharges = deliveryCharges;
    if (polygon !== undefined) zone.polygon = polygon;
    if (center !== undefined) zone.center = center;
    if (meta !== undefined) zone.meta = meta;
    zone.updatedBy = req.user._id;
    await city.save();
    res.status(200).json({ message: 'Zone updated', zone });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.deleteZone = async (req, res) => {
  try {
    const { id } = req.params; // zone id
    const city = await City.findOne({ 'zones._id': id });
    if (!city) return res.status(404).json({ message: 'Zone not found' });
    city.zones.id(id).remove();
    await city.save();
    res.status(200).json({ message: 'Zone deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getPublicZones = async (req, res) => {
  try {
    const { city } = req.query;
    const query = { 'isActive': true };
    if (city) query._id = city;
    const cities = await City.find(city ? { _id: city } : {}).select('name zones');
    const result = [];
    for (const c of cities) {
      const zones = (c.zones || []).filter(z => z.isActive);
      for (const z of zones) result.push({ city: { _id: c._id, name: c.name }, zone: z });
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.lookupZoneByPoint = async (req, res) => {
  try {
    const { long, lat, city } = req.body;
    if (long === undefined || lat === undefined) return res.status(400).json({ message: 'long and lat required' });
    const point = { type: 'Point', coordinates: [ Number(long), Number(lat) ] };
    const match = city ? { _id: mongoose.Types.ObjectId(city) } : {};
    const agg = [
      { $match: match },
      { $unwind: '$zones' },
      { $match: { 'zones.polygon': { $geoIntersects: { $geometry: point } } } },
      { $project: { city: { _id: '$_id', name: '$name' }, zone: '$zones' } },
      { $limit: 1 }
    ];
    const found = await City.aggregate(agg);
    if (!found || found.length === 0) return res.status(404).json({ message: 'No zone found for this point' });
    res.status(200).json(found[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
