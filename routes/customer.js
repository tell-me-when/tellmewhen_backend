/*
To Do:
- Decrypt  */
import express from 'express';
import { getCustomerJobDetails } from '../repositories/jobRepo.js';
import { decryptJobId } from '../qr_generation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';


const customerRouter = express.Router();

//return information about a given job
customerRouter.get('/my_job/:job_id', asyncHandler(async (req, res) => {

    const jobId = req.params.job_id

    let decyptedId;
    try{
        decyptedId = decryptJobId(jobId)
    }catch(err){
        return res.status(400).json({ message: 'Invalid job reference' });
    }

    try{
        const results = await getCustomerJobDetails(decyptedId)

        if(!results){
            return res.status(404).json({ message: 'No such job' });
        }

        results["jobId"] = decyptedId;

        return res.status(200).json(results)
    }catch (err){
        console.error('Error looking up job:', err);
        return res.status(500).json({ error: 'Unable to look up job' })
    }

}))

export {customerRouter};


