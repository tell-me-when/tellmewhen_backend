// Express 4 does not catch rejected promises thrown by async route
// handlers — an unguarded `await` that rejects becomes an unhandled
// rejection and crashes the entire process, taking down every connected
// user over one failed query. Wrapping every handler in this forwards any
// rejection to next(err), which reaches the centralized error handler in
// app.js instead.
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
