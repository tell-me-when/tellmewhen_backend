import express from "express";
import { deleteBusiness } from "../repositories/businessRepo.js";
import { deleteUser } from "../repositories/workerRepo.js";
import {authMiddleWare, adminMiddleWare, moderatorMiddleWare} from '../authMiddleWare.js';
import {removeSubscription} from "../repositories/subscriptionRepo.js"
import { validateBody } from "../middleware/validate.js";
import { deleteSubscriptionSchema } from "../schemas/delRoutes.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
const deletionRouter = express.Router()

// Delete a worker from a business
/**
     * @route POST /user/:uid
     * @access Admin
     * 
     * @description Deletes a user from the business database and revokes their access & refresh token
     *
     * @middleware authMiddleWare: Verifies the JWT and attaches the decoded token to req.user
     * @middleware adminMiddleWare: Verfies the user has admin priviliges
     * 
     * Request Parameters:
     * @param {string} req.params.uid - The user ID of the worker being deleted.
     *
     * Request Context (injected by middleware):
     * @param {Int} req.user.userId - the ID of the admin making the deletion.
     * @param {Int} req.user.businessId - the business the admin belongs to; the
     *   target worker must belong to the same business or the deletion is rejected.
     *
     * Responses
     * - 204 (No Content) if deletion is successful.
     * - 409 (Conflict) if the target doesn't exist, belongs to another business,
     *   is the caller's own account, or there's no admin left to reassign jobs to.
     * - 401 (Unauthorized) if a non-admin account tries to delete a user.
     */
deletionRouter.post('/user/:uid',authMiddleWare, adminMiddleWare, asyncHandler(async(req,res) =>{

    const userId = req.params.uid;

    const currentId = req.user.userId;
    const businessId = req.user.businessId;
    try{

        await deleteUser(userId,currentId,businessId);

   }catch(err){

        // deleteUser only throws deliberate, human-readable messages
        // (self-delete, wrong business, no admin to reassign to) — safe
        // to surface directly, unlike a raw DB error.
        console.error('Error deleting user:', err);
        return res.status(409).json({error: err.message});

   }

   return res.sendStatus(204);
}))
//delete a business' whole account
deletionRouter.post("/:bid",authMiddleWare,adminMiddleWare, asyncHandler(async(req,res) =>{
    /** POST /delete/:bid
    * This endpoint is used to delete a business from the database and service. There must
    * be sufficient validation done on the front end to make sure a business doesn't delete 
    * its account by accident
    * Middleware:
    * - `authMiddleWare`: Verifies the JWT and attaches the decoded token to req.user
    * - `adminMiddleWare`: Verfies the user has admin priviliges
    * 
    * Request Parameters
    * @param {string} req.params.bid - The business ID of the business being deleted
    * 
    * Request Context (Injected by middleware)
    * @param {Int} req.user.businessId - The business ID to which the user belongs
    * 
    * Responses
    * - 204 (No content) if the deletion processes successfully
    * - 401 (Unauthorised) if the user does not have an admin account
    *   - If credentials do not match (`"Passwords do not match"`).
    *   - If user credentials cannot be retrieved from the database (`"Unable to retrieve credentials from DB"`).
    * - 403 (Forbidden) if the businessId in the token doesn't match the one in the request
    * - 500 (Internal server error) if the db helper function fails
    */
    const businessId = parseInt(req.params.bid)
    
    if(!(businessId === req.user.businessId)){

        return res.status(403).json({ error:'Unable to delete another business'});

    }
    try{

        await deleteBusiness(businessId);

        return res.sendStatus(204)
    }catch(err){

        console.error('Error deleting business:', err);
        return res.status(500).json({ error: 'Unable to delete business' });

    }

}))

/**
 * @route /delete/subscription
 * @descrtiption deletes a subscription 
 * @access any
 * 
 * @param {req} - express request object
 * @param {req.body.jobId} -the job id associated with the subscription object
 * 
 * @param {res} - express response object
 * @return {JOSN} - 204(Created) if the record is succesfully deleted
 * 
 * */
deletionRouter.post('/subscription', validateBody(deleteSubscriptionSchema), asyncHandler(async(req,res) =>{

    const jobId = req.body.jobId;

    try{

        await removeSubscription(jobId);
        return res.sendStatus(204)

    }catch(err){

        console.error('Error deleting subscription:', err);
        return res.status(500).json({error: 'Unable to delete subscription'})
    }

}))


export { deletionRouter }