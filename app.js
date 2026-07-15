import './config/env.js';

import createError from 'http-errors';
import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import cors from "cors";

import {indexRouter} from "./routes/index.js";
import {deletionRouter} from './routes/delRoutes.js';
import { jobRouter } from './routes/jobs.js';
import {businessRouter} from './routes/manageBusiness.js';
import { customerRouter } from './routes/customer.js';
import {chatRouter} from './routes/chat.js';

// Origins allowed to make credentialed (cookie-carrying) requests to this
// API. Falls back to the production frontend + local dev if unset.
const corsOrigins = (process.env.CORS_ORIGINS || 'https://tellmewhen.co.uk,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

var app = express();
const __dirname = "";

app.use(logger('dev'));
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: '5mb' })); // sized for base64 profile photos
app.use(express.urlencoded({ extended: false, limit: '5mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/delete', deletionRouter)
app.use('/jobs', jobRouter)
app.use("/business", businessRouter);
app.use('/customer',customerRouter)
app.use('/chat', chatRouter)


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// Centralized error handler. Full detail (stack, SQL errors, etc.) is
// logged server-side only — clients get a generic message, so internals
// never leak in a response body.
app.use(function(err, req, res, next) {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
});

app.listen(process.env.PORT, ()=>{
  console.log(`Server listening on http://localhost:${process.env.PORT}`)
})
// export { app };
