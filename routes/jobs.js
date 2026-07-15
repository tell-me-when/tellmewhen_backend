import express from 'express';
import webPush from 'web-push'
// db helper functions
import { getJobHistory, getOpenJobs, createNewJob, assignJobToUser, completeJob, getJobDetails, countOpenJobs, countTotalJobs } from '../repositories/jobRepo.js';
import { getSubscription } from '../repositories/subscriptionRepo.js';
import { findWorkerInBusiness } from '../repositories/workerRepo.js';
//middleware functions for encyrption, authentication and data integrity
import {authMiddleWare, adminMiddleWare, moderatorMiddleWare} from '../authMiddleWare.js';
import { decodeJobIdParam, decodeJobIdBody } from '../middleware/jobId.js';
import { validateBody } from '../middleware/validate.js';
import { assignJobSchema, newJobSchema, completeJobSchema, notifyJobSchema } from '../schemas/jobs.js';
import { ROLES } from '../constants/roles.js';
import { generate_qr } from "../qr_generation.js";
import { asyncHandler } from '../middleware/asyncHandler.js';

const jobRouter = express.Router();

/**
 * @route GET /jobs/history
 * @access User
 * 
 * @description Retrieves a business's job history for an authenticated user.
 * 
 * @middleware authMiddleWare - Validates the user's JWT access token.
 * 
 * @param {Object} req - Express request object.
 * @param {Object} req.user - Decoded JWT payload containing user details.
 * @param {string} req.user.businessId - The ID of the business the user belongs to.
 * @param {string} req.user.userId - The ID of the authenticated user.
 * 
 * @param {Object} res - Express response object.
 * 
 * @returns {JSON} 200 - OK. Returns the job history.
 *   ```json
 *   [
 *     {
 *       "jobId": "<string>",
 *       "title": "<string>",
 *       "status": "<string>",
 *       "completionDate": "<ISO date>",
 *       "remarks": "<String>"
 *     }
 *   ]
 *   ```
 * @returns {JSON} 401 - Unauthorized. If the user is not authenticated.
 * @returns {JSON} 500 - Internal Server Error. If an error occurs while querying the database.
 * 
 * @notes
 * - The user must be **authenticated** to access this endpoint.
 * - The job history is retrieved based on the user's associated `businessId`.
 */

jobRouter.get('/history',authMiddleWare, asyncHandler(async (req, res) => {

    const businessId = req.user.businessId;
    const userId = req.user.userId;

    let result;
    try{

      result = await getJobHistory(businessId,userId);

      return res.status(200).json(result);

    }catch(err){

      console.error('Error fetching job history:', err);
      return res.status(500).json({ error: 'Unable to fetch job history' });

    }
}));

/**
 * @route GET /jobs/open_jobs/:bid
 * @access User
 * 
 * @description Retrieves the count of open jobs for a given business.
 * 
 * @middleware authMiddleWare - Validates the user's JWT access token.
 * 
 * @param {Object} req - Express request object.
 * @param {Object} req.user - Decoded JWT payload containing user details.
 * @param {string} req.user.businessId - The ID of the business the user belongs to.
 * @param {Object} res - Express response object.
 * 
 * @returns {JSON} 200 - OK. Returns the count of open jobs.
 *   ```json
 *   {
 *     "data": <number>
 *   }
 *   ```
 * @returns {JSON} 401 - Unauthorized. If the user is not authenticated.
 * @returns {JSON} 500 - Internal Server Error. If an error occurs while querying the database.
 * 
 * @notes
 * - The `businessId` is extracted from the authenticated user's JWT.
 * - The count of open jobs is retrieved using the `countOpenJobs` function.
 */
jobRouter.get('/open_jobs/:bid', authMiddleWare, asyncHandler(async(req,res) => {

    const businessId = req.user.businessId
    let result;
    try{

        result = await countOpenJobs(businessId)
        return res.status(200).json({ data:result });

    } catch (err) {

        console.error('Error counting open jobs:', err);
        return res.status(500).json( { error: 'Unable to count open jobs' } );

    }
}))



/**
 * @route GET /jobs/total_jobs/:bid
 * @access User
 * 
 * @description Retrieves the total number of jobs associated with a given business.
 * 
 * @middleware authMiddleWare - Validates the user's JWT access token.
 * 
 * @param {Object} req - Express request object.
 * @param {Object} req.user - Decoded JWT payload containing user details.
 * @param {string} req.user.businessId - The ID of the business the user belongs to.
 * @param {Object} res - Express response object.
 * 
 * @returns {JSON} 200 - OK. Returns the total number of jobs.
 *   ```json
 *   {
 *     "data": <number>
 *   }
 *   ```
 * @returns {JSON} 401 - Unauthorized. If the user is not authenticated.
 * @returns {JSON} 500 - Internal Server Error. If an error occurs while querying the database.
 * 
 * @notes
 * - The `businessId` is extracted from the authenticated user's JWT.
 * - The total job count is retrieved using the `countTotalJobs` function.
 */
jobRouter.get('/total_jobs/:bid', authMiddleWare, asyncHandler(async(req,res) => {

    //extract business id
    const businessId = req.user.businessId;
    let result;
    try{

      result = await countTotalJobs(businessId);
      return res.status(200).json({ data:result});

    }catch (err) {

      console.error('Error counting total jobs:', err);
      return res.status(500).json( { error: 'Unable to count total jobs' } );

    }
}));


/**
 * @route GET /jobs/current/:uid
 * @access User
 * 
 * @description Retrieves the currently open jobs assigned to a specific user within a business.
 * 
 * @middleware authMiddleWare - Validates the user's JWT access token.
 * 
 * @param {Object} req - Express request object.
 * @param {Object} req.user - Decoded JWT payload containing user details.
 * @param {string} req.user.businessId - The ID of the business the user belongs to.
 * @param {string} req.params.uid - The ID of the user whose open jobs are being retrieved.
 * @param {Object} res - Express response object.
 * 
 * @returns {JSON} 200 - OK. Returns a JSON object containing open job details.
 *   ```json
 *   {
 *     "jobId": "<job_id>",
 *     "description": "<job_title>",
 *     "Due_Date": "<ISO time> ",
 *     "user_ID": "<user_id>",
 *   }
 *   ```
 * @returns {JSON} 401 - Unauthorized. If the user is not authenticated.
 * @returns {JSON} 500 - Internal Server Error. If an error occurs while querying the database.
 * 
 * @notes
 * - The `businessId` is extracted from the authenticated user's JWT.
 * - The `userId` is taken from the request parameters.
 * - Open job details are retrieved using the `getOpenJobs` function.
 */
jobRouter.get('/current/:uid',authMiddleWare, asyncHandler(async (req, res) => {

    const businessId = req.user.businessId;
    const userId = req.params.uid;
    console.log(userId)

    let result;
    try{

        result = await getOpenJobs(businessId,userId);

        return res.status(200).json(result);

    }catch(err){

      console.error('Error fetching current jobs:', err);
      return res.status(500).json({ error: 'Unable to fetch current jobs' });

    }
}));



/**
 * @route POST /jobs/assign_job
 * @access Moderator
 * 
 * @description Assigns a job to a specific user within the business.
 * 
 * @middleware authMiddleWare - Ensures the user is authenticated via JWT.
 * @middleware moderatorMiddleWare - Ensures the user has moderator privileges.
 * 
 * @param {Object} req - Express request object.
 * @param {Object} req.body - The request payload containing job assignment details.
 * @param {string} req.body.jid - The encrypted job ID to be assigned.
 * @param {string} req.body.uid - The user ID of the worker receiving the job.
 * @param {Object} res - Express response object.
 * 
 * @returns {JSON} 201 - Created. Job successfully assigned.
 *   ```json
 *   {
 *     "message": "Job <jobId> assigned to worker with id: <userId>"
 *   }
 *   ```
 * @returns {JSON} 401 - Unauthorized. If the user lacks authentication or sufficient privileges.
 * @returns {JSON} 500 - Internal Server Error. If an error occurs during job assignment.
 * 
 * @notes
 * - The `jid` (encrypted job ID) is decrypted before assigning the job.
 * - Only users with **moderator** privileges can assign jobs.
 * - Uses `assignJobToUser` to store the assignment in the database.
 */
jobRouter.post('/assign_job',authMiddleWare, moderatorMiddleWare, validateBody(assignJobSchema), decodeJobIdBody('jid'), asyncHandler(async (req,res) => {
    const jobId = req.jobId;
    const userId = req.body.uid;
    const businessId = req.user.businessId;

    try{

        // the target worker must belong to the same business as the caller
        const targetWorker = await findWorkerInBusiness(userId, businessId);
        if(targetWorker.length === 0){
            return res.status(404).json({ message: 'No such worker in this business' });
        }

        // scoped to businessId — a job outside the caller's business affects 0 rows
        const result = await assignJobToUser(userId,jobId,businessId);
        if(result.affectedRows === 0){
            return res.status(404).json({ message: 'No such job in this business' });
        }

        return res.status(201).json({message : `Job ${jobId} assigned to worker with id: ${userId}`});

    }catch (err) {

        console.error('Error assigning job:', err);
        return res.status(500).json({ error: 'Unable to assign job' });

    }


}));



/**
 * @route POST /jobs/new
 * @access User
 * 
 * @description Creates a new job in the database and generates a corresponding QR code.
 * 
 * @middleware authMiddleWare - Ensures the user is authenticated via JWT.
 * 
 * @param {Object} req - Express request object.
 * @param {Object} req.body - The request payload containing job details.
 * @param {string} req.body.description - The description of the job.
 * @param {string} req.body.dueDate - The due date for job completion.
 * @param {number} req.body.assignedId - The ID of the user assigned to the job.
 * @param {Object} res - Express response object.
 * 
 * @returns {JSON} 200 - OK. Job successfully created.
 *   ```json
 *   {
 *     "message": "New job successfully registered",
 *     "qrCode": "<qr_url>",
 *     "jobId": "<job unique identifier>"
 *   }
 *   ```
 * @returns {JSON} 401 - Unauthorized. If the user lacks authentication.
 * @returns {JSON} 500 - Internal Server Error. If an error occurs while creating the job or generating the QR code.
 * 
 * @notes
 * - Uses `createNewJob` to store the job in the database.
 * - A unique job ID is generated and used to create a QR code.
 * - The QR code URL is returned in the response.
 */
jobRouter.post('/new', authMiddleWare, validateBody(newJobSchema), asyncHandler(async (req,res) => {

    const jobData = req.body;
    const description = jobData.description;
    const dueDate = jobData.dueDate;
    var userId = req.user.userId;
    const assignedId = jobData.assignedId;
    const businessId = req.user.businessId;
    console.log(req.user)

    //check if the user has the right permissions
    if(assignedId != userId){

        if(req.user.role === ROLES.WORKER){

            return res.status(403).json({ message:"This action requires escalated permissions"})

        }

        // the assignee must belong to the same business as the caller
        const targetWorker = await findWorkerInBusiness(assignedId, businessId);
        if(targetWorker.length === 0){
            return res.status(404).json({ message: 'No such worker in this business' });
        }

        //replace the userId from the middleware with the assinged userId
        userId = assignedId;
    }
    try{

        const result = await createNewJob(businessId,userId,description,dueDate);
        //extract random job id
        const randomJobId = result.randomJobId;
        //generate qr code
        const qr_url = await generate_qr(randomJobId);

        return res.status(201).json({message: "New job succesfully created", 
            qrCode: qr_url,
            jobId: randomJobId
        });

    } catch (err) {

        console.error('Error creating job:', err);
        return res.status(500).json({ error: 'Unable to create job' })
}
}))

/**
 * @route POST /jobs/complete/:jid
 * @access User
 * 
 * @description Marks a job as complete
 * 
 * @middleware authMiddleWare - Ensures the user is authenticated via JWT.
 * 
 * @param {Object} req - express request object
 * @param {String} req.params.jid - the encrypted unique jobId
 * @param {Object} req.body - the request payload
 * @param {String} req.user.userId - the user who has submitted the request, injected by middleware
 * @param {String} [req.body.remarks] - remarks relating to the job completion
 *
 * @param {Object} res - express respsonse object
 * @returns {JSON} 201 - Created if the job is marked as complete successfully
 * @returns {JSON} 401 - Unauthorized. If the user lacks authentication.
 * @returns {JSON} 403 - Forbidden. If a worker tries to mark another worker's job as complete
 * @returns {JSON} 404 - Not found. If the job doesn't exist or isn't in the caller's business
 * @returns {JSON} 500 - Internal Server Error. If an error occurs while updating the DB record
 */
jobRouter.post('/complete/:jid',authMiddleWare, decodeJobIdParam('jid'), validateBody(completeJobSchema), asyncHandler(async (req,res) =>{
    const jobId = req.jobId;
    const userId = req.user.userId;
    const businessId = req.user.businessId;
    const remarks = req.body.remarks;

    const jobDetails = await getJobDetails(jobId);

    if(!jobDetails || jobDetails.Business_ID !== businessId){

      return res.status(404).json({ message: 'No such job in this business' })

    }

    // a worker (lowest privilege) may only complete jobs assigned to them
    if(req.user.role === ROLES.WORKER && jobDetails.User_ID != userId){

      return res.status(403).json({ message: 'A worker cannot complete another workers job'})

    }

    console.log(`JOB COMPLETE:\nUSER_ID:${userId}\nJob ID:${jobId}\nRemarks:${remarks}`)
    try{

        await completeJob(userId,jobId,businessId,remarks)

        return res.status(201).json( { message: 'Job marked as complete'})

    }catch (err) {
        console.error('Error completing job:', err)
        return res.status(500).json( { error: 'Unable to complete job' } )

    }


}))

//send customer a notification
/**
 * @route POST /notify/:bid/:jid
 * @access User
 * 
 * @description sends a notification to the customer
 * 
 * @param {Object} req - express request object
 * @param {String} req.params.jid - encrypted job ID
 * @param {Int} req.user.businessId - the business ID to which the user belongs
 * @param {String} req.body.title - the notification title 
 * @param {String} req.body.message - the message to be placed in the notification
 * 
 * @param {Object} res - express response object
 * @returns {JSON} 200 - OK if the notification is successfully sent
 * @returns {JSON} 500 - Internal server error
 * 
 */
jobRouter.post('/notify/:jid',authMiddleWare, decodeJobIdParam('jid'), validateBody(notifyJobSchema), asyncHandler(async (req, res) => {
    // Notify the customer and update the notification table
    const businessId = req.user.businessId;
    const jobId = req.jobId;

    const messageBody = req.body.message || 'Your job is ready for pickup';
    const messageTitle = req.body.title || 'There is an update to your job';

    let pushSubscription;
    try{

       const subscriptions = await getSubscription(jobId,businessId);
       pushSubscription = subscriptions[0];
       if( pushSubscription === undefined){

            return res.status(400).json({error:'Customer has not enabled notifications'})
       }

    } catch (err) {
      console.error('Error looking up push subscription:', err);
      return res.status(500).json({ error: 'Unable to look up subscription' });

    }
  
    const payload = JSON.stringify({
      title: messageTitle,
      body: messageBody,
    })
  
    const options = {
      vapidDetails: {
        subject: 'mailto:admin@tellmewhen.co.uk',
        publicKey: process.env.VAPID_PUBLIC,
        privateKey: process.env.VAPID_PRIVATE
      }};
    
    let subscription = {
      endpoint: pushSubscription.Endpoint,
      keys: {
        auth: pushSubscription.Auth_Key1,
        p256dh: pushSubscription.Auth_Key2,
      }
    }
    //send notifcation using PUSH API
    try{

      await webPush.sendNotification(subscription, payload, options)

      return res.status(200).json({ message:'Notification sent'})

    }catch(err){
      console.error('Error sending push notification:', err);
      return res.status(500).json({ error: 'Unable to send notification' })
    }

}))

/**
 * @route GET /jobs/display_code/:jid
 * @access User 
 * 
 * @description Returns the base 64 encoded string representing the qr code for a given job
 * 
 * @middleware authMiddleWare - Ensures the user is authenticated via JWT.
 * 
 * @param {Object} req - express request object
 * @param {String} req.params.jid - the encrypted unique jobId
 * 
 * @param {Object} res - express response object
 * @returns {JSON} 201 - Created, qr code successfully regened
 * ```json
 * {
 *  "qrCode":"<base64 encoded qr code>"
 * }
 * @returns {JSON} 401 - Unauthorised, the user cannot be authenicated
 * @returns {JSON} 404 - Not found, a job does not exist in the DB
 * @returns {JSON} 500 - Internal server error, the server failed to create the qr code 
 */
jobRouter.get('/display_code/:jid', authMiddleWare, decodeJobIdParam('jid'), asyncHandler(async(req,res) =>{

    //check DB to see if jobId exists and belongs to the caller's business

    const jobId = req.jobId;

    try{

        const result = await getJobDetails(jobId)
        if(!result || result.Business_ID !== req.user.businessId){

            return res.status(404).json({ error:'No such job ID found in db'})

        }
    }catch(err){

        console.error('Error looking up job in DB:', err);
        return res.status(500).json({ error: 'Unable to look up job' })
    }

    try{

        const qrResult = await generate_qr(jobId)
        return res.status(201).json({
            qrCode : qrResult
        })

    }catch (err){

        console.error('Error generating QR code:', err);
        return res.status(500).json({ error: 'Unable to generate QR code' })
    }

}))

export {jobRouter};
