// Rejects a request before it reaches business logic if req.body/params
// don't match the given zod schema. On success, req.body/params is replaced
// with the parsed (typed, trimmed) result.
export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      message: 'Invalid request body',
      issues: result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`),
    });
  }
  req.body = result.data;
  next();
};

export const validateParams = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.params);
  if (!result.success) {
    return res.status(400).json({
      message: 'Invalid request parameters',
      issues: result.error.issues.map((i) => `${i.path.join('.') || 'params'}: ${i.message}`),
    });
  }
  req.params = result.data;
  next();
};

export const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({
      message: 'Invalid query parameters',
      issues: result.error.issues.map((i) => `${i.path.join('.') || 'query'}: ${i.message}`),
    });
  }
  req.query = result.data;
  next();
};
