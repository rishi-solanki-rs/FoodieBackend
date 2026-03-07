
const getPaginationParams = (req, defaultLimit = 20) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || defaultLimit;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};
const buildSearchQuery = (searchTerm, fields = ["name"]) => {
  if (!searchTerm) return {};
  const searchRegex = { $regex: searchTerm, $options: "i" };
  if (fields.length === 1) {
    return { [fields[0]]: searchRegex };
  }
  return {
    $or: fields.map((field) => ({ [field]: searchRegex })),
  };
};
const formatPaginatedResponse = (
  data,
  total,
  page,
  limit,
  dataKey = "data"
) => {
  return {
    [dataKey]: data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  };
};
module.exports = {
  getPaginationParams,
  buildSearchQuery,
  formatPaginatedResponse,
};
