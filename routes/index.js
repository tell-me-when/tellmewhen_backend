/** 
 * @file index.js
 * @description This file contains the main routes for the application, including user authentication, registration, and token management.
 * @author V. Stojkovic
 * @date 2025-01-10
 * @version 1.0
*/
  

import express from 'express';
import fs from 'fs';
import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';

import { getBusinessId, registerBusinessAndAdmin, isSubdomainTaken, RegistrationConflictError } from '../repositories/businessRepo.js';
import { login, searchEmployees } from '../repositories/workerRepo.js';
import { addToken, freezeUser } from '../repositories/tokenRepo.js';
import { addSubscription } from '../repositories/subscriptionRepo.js';
import {authMiddleWare, adminMiddleWare, moderatorMiddleWare} from '../authMiddleWare.js';
import { blackListToken, checkToken } from '../blacklist.js';
import { decryptJobId } from '../qr_generation.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { loginSchema, registerSchema, checkSubdomainQuerySchema, saveSubscriptionSchema } from '../schemas/index.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// set up the keys for authentication
const accessPrivateKey = await importPKCS8(fs.readFileSync('jwtRSA256-private.pem','utf-8'), 'RS256');

// set up keys for refresh
const refreshPrivateKey = await importPKCS8(fs.readFileSync('refresh-private.pem','utf-8'), 'RS256');
const refreshPublicKey = await importSPKI(fs.readFileSync('refresh-public.pem','utf-8'), 'RS256');

// Partitioned cookies (CHIPS) require Secure — a browser will silently
// refuse to store the cookie at all if Partitioned is set without Secure,
// which is exactly the case over plain HTTP in local dev. Tie both to the
// same condition so they're never mismatched.
const isSecureContext = process.env.NODE_ENV === "production";

const accessCookieOptions = {
  httpOnly: true,  // Prevent access via JavaScript
  secure: isSecureContext, // Only in HTTPS
  sameSite: "Strict",
  partitioned: isSecureContext,
  maxAge:  60 * 60 * 1000 // 1 hour
};

const refreshCookieOptions = {
  httpOnly: true,  // Prevent access via JavaScript
  secure: isSecureContext, // Only in HTTPS
  sameSite: "Strict",
  partitioned: isSecureContext,
  maxAge: 24 * 60 * 60 * 1000 // 1 day
};

const indexRouter = express.Router();

/**
 * @route POST /login
 * @description Authenticates a user and returns access & refresh tokens.
 * @access Public
 *
 * @requestBody
 * @param {string} req.body.name - The business name the user is associated with.
 * @param {string} req.body.username - The username of the user attempting to log in.
 * @param {string} req.body.password - The user's password.
 *
 * @response
 * @returns {JSON} 200 - Successfully authenticated.
 * - Cookies:
 *   - `access` (HTTP-only, valid for 1 hour) - The access token.
 *   - `refresh` (HTTP-only, valid for 1 day) - The refresh token.
 * - JSON response:
 *   ```json
 *   {
 *     "message": "access token and refresh cookie sent in cookies",
 *     "userId": "<userId>",
 *     "businessId": "<businessId>"
 *   }
 *   ```
 * @returns {JSON} 400 - Bad Request (Missing required fields).
 * @returns {JSON} 401 - Unauthorized:
 *   - `"Passwords do not match"` (Incorrect credentials).
 *   - `"Unable to retrieve credentials from DB"` (User not found).
 * @returns {JSON} 500 - Internal Server Error (Failed to store tokens in DB).
 *
 * @authentication
 * - Uses **RS256 JWT tokens**:
 *   - **Access Token** (1h expiry) includes:
 *     - `username` - The user's username.
 *     - `role` - The user's privilege level.
 *     - `userId` - The user’s unique ID.
 *     - `businessId` - The business ID the user belongs to.
 *   - **Refresh Token** (1d expiry) is signed separately for re-authentication.
 *
 * @notes
 * - Tokens are stored in **HTTP-only cookies** for security.
 * - Passwords are securely hashed and verified using **bcrypt**.
 */

indexRouter.post('/login', validateBody(loginSchema), asyncHandler(async (req, res) => {

    const businessName = req.body.name;
    const username = req.body.username;
    const password = req.body.password;

    const businessId = await getBusinessId(businessName);
    // check the database for the user
    console.log(`Business Name: ${businessName}\nBusinessID: ${businessId}`)

    const loginCredentials = await login(businessName,username)
  
    if (loginCredentials){
    
        let isMatch = await bcrypt.compare(password, loginCredentials.Hashed_Password)

        if (isMatch){
            // prepare empolyee information for token
            const userId = loginCredentials.User_ID;
            const role = loginCredentials.Role;
            const businessId = loginCredentials.Business_ID;

            // create new jwt
            const accessToken = await new SignJWT({
                username: username,
                role: role,
                userId:userId,
                businessId:businessId
                })
                .setProtectedHeader({ alg: 'RS256' })
                .setIssuedAt()
                .setExpirationTime('1h')
                .sign(accessPrivateKey);
            // create new refresh token
            const refreshToken = await new SignJWT({
                username: username,
                userId: userId,
                businessId: businessId
                })
                .setProtectedHeader({ alg: 'RS256' })
                .setIssuedAt()
                .setExpirationTime('1d')
                .sign(refreshPrivateKey);

            try{

                await addToken(loginCredentials.User_ID,accessToken);
                await addToken(loginCredentials.User_ID,refreshToken);

            }catch(err){

                console.error(`Error when populating tokens: ${err}`)
                return res.status(500).json({ message:'Unable to append tokens to db'})
            }

            return res.status(200).
            cookie('access',accessToken,accessCookieOptions).
            cookie('refresh',refreshToken,refreshCookieOptions).
            json({message:'access token and refresh cookie sent in cookies',
            userId: userId,
            businessId : businessId
            });
        }else{

        return res.status(401).json({error: "Passwords do not match"});

    }

    }else{
        
        return res.status(500).json({error: "Unable to retrieve credentials from DB"});

    }
}));

/**
 * @route GET /register/check-subdomain
 * @access Public
 *
 * @description Live availability check for a subdomain slug during the
 * registration wizard's first step. Reserves nothing — a race is still
 * possible between this check and the final POST /register, which is why
 * that route also enforces uniqueness at the DB level (see
 * RegistrationConflictError in repositories/businessRepo.js).
 *
 * @param {String} req.query.subdomain - candidate subdomain, format+blocklist
 *   validated by checkSubdomainQuerySchema before this handler runs
 *
 * @returns {JSON} 200 - { subdomain, available: boolean }
 * @returns {JSON} 400 - invalid format or a reserved word (see validateQuery)
 */
indexRouter.get('/register/check-subdomain', validateQuery(checkSubdomainQuerySchema), asyncHandler(async (req, res) => {
    const { subdomain } = req.query;
    const taken = await isSubdomainTaken(subdomain);
    return res.status(200).json({ subdomain, available: !taken });
}));

// register a new business and admin
/**
 * @route POST /register
 *
 * @description Registers a new business with the service if one with its
 * name or subdomain does not already exist in our DB. Business-info fields
 * are optional and visible to customers; the subdomain is reserved as a
 * unique value only — no live *.tellmewhen.co.uk routing exists yet.
 *
 * @param {string} req.body.name - the name of the new business
 * @param {string} req.body.username - the account username of the default admin
 * @param {string} req.body.password - the plaintext password of the default admin
 * @param {string} req.body.subdomain - reserved subdomain slug
 * @param {string} [req.body.address] - customer-facing address/location
 * @param {string} [req.body.locationLink] - Google Maps or what3words URL
 * @param {string} [req.body.phone] - customer-facing phone number
 * @param {string} [req.body.email] - customer-facing email
 * @param {string} [req.body.openingHours] - free-text opening hours
 * @param {boolean} req.body.tosAccepted - must be true; acceptance timestamp is server-set
 *
 * Responses:
 * - 201 (Created) { message, businessId } if the new business registers successfully
 * - 400 (Bad Request) if fields are missing or malformed (see registerSchema)
 * - 409 (Conflict) { error, field: 'name'|'subdomain' } if already taken
 * Notes:
 * - As the first user to register the business is the only user, they are admin by default
 */
indexRouter.post('/register', validateBody(registerSchema), asyncHandler(async (req, res) => {

    const { name, username, password, subdomain, address, locationLink, phone, email, openingHours, tosAccepted } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const { businessId } = await registerBusinessAndAdmin({
            businessName: name, username, hashedPassword, subdomain,
            address, locationLink, phone, email, openingHours,
            tosAcceptedAt: tosAccepted ? new Date() : null,
        });
        return res.status(201).json({ message: 'Success, Business Registered', businessId });
    } catch (err) {
        if (err instanceof RegistrationConflictError) {
            return res.status(409).json({
                error: err.field === 'name' ? 'A business with that name already exists' : 'That subdomain is already taken',
                field: err.field,
            });
        }
        throw err; // asyncHandler -> centralized error handler -> generic 500
    }
}));

/**
 * @route POST /refresh
 *
 * @description Refreshes a user's access token if they have a valid refresh
 * token cookie. No request body is used — identity (username, userId,
 * businessId) is derived entirely from the verified refresh token itself,
 * never from client-supplied data.
 * @access Public
 *
 * @param {Object} req - Express request object
 * @returns {JSON} 201 - Created new tokens
 * @returns {JSON} 400 - Token has been blacklisted/revoked
 * @returns {JSON} 403 - The refresh token no longer matches a valid user
 * @returns {JSON} 406 - No refresh token cookie provided, or it failed to verify
 * @returns {JSON} 500 - Internal Server Error
 */
indexRouter.post('/refresh', asyncHandler(async(req,res) => {

    if(!req.cookies?.refresh){
        return res.status(406).json({ message: "Unauthorised, no refresh token provided. Please sign out and login again"});
    }

    const token = req.cookies.refresh

    // Identity is derived entirely from the verified, signed refresh token —
    // never from the request body, which the client fully controls.
    let decoded;
    try{
        const verified = await jwtVerify(token, refreshPublicKey, { algorithms: ['RS256'] });
        decoded = verified.payload;
    }catch(err){
        // Wrong Refesh Token
        return res.status(406).json({ message: 'Error in decoding' });
    }

    const username = decoded.username;
    const id = decoded.userId;
    const businessId = decoded.businessId;

    //Check wether the token has been blacklisted
    const validToken = await checkToken(token)

    if(!validToken){

        await freezeUser(id);
        return res.status(400).json({ message:"Invalid token used"});

    }

    //look up user in DB
    try{

        const user_data = await searchEmployees(username,businessId);

        if(!user_data[0]){
            // User no longer exists in this business — the token is stale.
            await freezeUser(id);
            await blackListToken(token);
            return res.status(403).json({ message: 'The refresh token no longer matches a valid user' });
        }

        const accessToken = await new SignJWT({
            username:username,
            userId: id,
            role:user_data[0].Role,
            businessId: businessId
        })
            .setProtectedHeader({ alg: 'RS256' })
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(accessPrivateKey);

        const newRefreshToken = await new SignJWT({
            username:username,
            userId: id,
            businessId:businessId
        })
            .setProtectedHeader({ alg: 'RS256' })
            .setIssuedAt()
            .setExpirationTime('1d')
            .sign(refreshPrivateKey);

        // add new token to db
        await addToken(id, newRefreshToken);
        // blacklist old  token
        await blackListToken(token);
        //return new tokens to client
        return res.status(201).
        cookie('access',accessToken,accessCookieOptions).
        cookie('refresh',newRefreshToken,refreshCookieOptions).
        json({message:"New tokens generated"});

    }catch(err){

        return res.status(500).json({ error:'Error whilst looking up DB' });

    }
}))


/**
 * @route POST /save-new-subscription
 * @acces Public
 * 
 * @description Stores a new PUSH-API subscription in the DB, needed to send a notification
 * 
 * @param {Object} req - express request object
 * @param {String} req.body.endpoint - the web-push endpoint
 * @param {JSONWebKeySet} req.body.keys - authentication key pair
 * @param {String} req.body.encryptedJobId - the encrypted Job Id as appears in the user url
 * @param {Int} req.body.businessId - the business ID of the business responsible for the job
 * 
 * @param {Object} res - express response object
 * @return {JSON} 201 - subscription successfully saved
 * @return {JSON} 500 - internal server error
 */
indexRouter.post('/save-new-subscription', validateBody(saveSubscriptionSchema), asyncHandler(async(req,res) => {

  const endpoint = req.body.endpoint;
  const keys = req.body.keys;
  const encryptedJobId = req.body.jobId;
  const businessId = req.body.businessId;

  //recover the actual job ID
  let jobId;
  try{
    jobId = decryptJobId(encryptedJobId);
  }catch(err){
    return res.status(400).json({ message: 'Invalid job reference' });
  }

  //save subscription to DB
  try{

    await addSubscription(jobId,businessId,endpoint, keys.auth, keys.p256dh)
    return res.status(201).json({ message: 'Subscription saved' });

  }catch(err){

    console.error('Error saving subscription:', err);
    return res.status(500).json({ error: 'Unable to save subscription' })

  }

}))
/**
 * @route POST /clearCookies
 * @access Public
 * 
 * @description Clears the http-Only cookies set by the server
 * 
 * @param {Object} res - express response object
 * @return {JSON} 204 - No content, cookies have been cleared
 * @return {JSON} 500 - Internal Server Error
 */
indexRouter.post('/clearCookies', asyncHandler(async (req,res) =>{
  //revoke the current tokens server-side, then clear them from the client
  try{
    if(req.cookies?.access){
      await blackListToken(req.cookies.access);
    }
    if(req.cookies?.refresh){
      await blackListToken(req.cookies.refresh);
    }
    res.clearCookie('access');
    res.clearCookie('refresh');
  }catch (err){
    console.error('Error during logout:', err);
    return res.status(500).json({ error:'Unable to log out' });
  }

  return res.sendStatus(204);
}))


/**
 * @route /adminTest
 * @access Dev-only/Admin
 * 
 * @description Tests the admin token decoding. Only for use in development
 * 
 * @param {Object} res - express response object
 * @returns {JSON} 200 - returns businessId if user is admin
 * @returns {JSON} 500 - Invalid route 
 */
indexRouter.get('/adminTest',authMiddleWare, adminMiddleWare, (req,res)=>{
  if(process.env.NODE_ENV === 'development'){

    res.json({message:`congrats you are an admin for business with id: ${req.user.businessId}`});

  }else{

    return res.status(500).json({error: 'invalid route'})

  }
})

/**
 * @route GET /me
 * @access User
 *
 * @description Returns the authenticated user's own identity, derived from
 * the verified access token — a durable source of truth the frontend can
 * use instead of trusting whatever it last cached in localStorage.
 *
 * @middleware authMiddleWare - Validates the user's JWT access token.
 *
 * @returns {JSON} 200 - { userId, username, role, businessId }
 * @returns {JSON} 401 - Unauthorized. If the user is not authenticated.
 */
indexRouter.get('/me', authMiddleWare, (req,res) => {
  return res.status(200).json({
    userId: req.user.userId,
    username: req.user.username,
    role: req.user.role,
    businessId: req.user.businessId,
  });
});

export { indexRouter };
