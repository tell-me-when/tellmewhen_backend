import { chatRouter, generateBusinessToken, generateGuestToken, createJobChannel, QuerybyName ,QuerybyUser,streamChat,deleteChannel} from '../chathelper.js';
import { findWorkerInBusiness } from '../repositories/workerRepo.js';
import { getJobsForWorker, jobExists, getJobHistoryBusinessId } from '../repositories/jobRepo.js';
import { authMiddleWare } from '../authMiddleWare.js';
import { validateBody } from '../middleware/validate.js';
import { deleteChannelSchema } from '../schemas/chat.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

chatRouter.get("/worker/login", authMiddleWare, asyncHandler(async (req, res) => {
    try {
        // Identity comes from the verified access token, never the URL —
        // previously anyone could mint a business chat token for any userId
        // just by putting it in the path.
        const userId = req.user.userId;
        const businessId = req.user.businessId;

        const workerResult = await findWorkerInBusiness(userId, businessId);

        if (workerResult.length === 0) {
            return res.status(404).json({ message: "Worker not found" });
        }

        const token = generateBusinessToken(userId);


        //jobs assigned to the worker
        const jobsResult = await getJobsForWorker(userId, businessId);

        // create chat channels for each job
        const channels = [];
        for (const job of jobsResult) {
            const jobId = job.Job_ID;
            const result = await QuerybyName(jobId);

            if (result.length === 0) {
                // Create the channel if it doesn't exist
                let channel = await createJobChannel(jobId, userId);
                channels.push(channel);
            }else {
                // Add existing channel to the list
                channels.push(result[0]);
            }

        }
        const simplifiedChannels = channels.map(channel => ({
            id: channel.id,
            name: channel.data.name,
            members: Object.values(channel.state.members).map(member => ({
                user_id: member.user_id,
                role: member.role,
            })),
        }));
        console.log(`Worker ${userId} logged in successfully`);
        res.status(200).json({ token:token, channels:simplifiedChannels });
    } catch (error) {
        console.error("Worker login error:", error.message);
        res.status(404).json({ message: "Server error" });
    }
}));

chatRouter.get("/guest/login/:jobId", asyncHandler(async (req, res) => {
    const jobId = req.params.jobId;
    if (!jobId) {
        return res.status(400).json({ message: "Invalid Job ID" });
    }
    try{
    // Reject IDs that don't correspond to a real job before creating any
    // Stream state for them.
    if (!(await jobExists(jobId))) {
        return res.status(404).json({ message: "No such job" });
    }

    const result = await QuerybyUser(jobId);
    if (result.users.length === 0) {
        await streamChat.upsertUser({id: "guest-" + jobId});
    }

    const guestToken = generateGuestToken(jobId);

    const channels = await QuerybyName(jobId);
    if (channels.length === 0) {
        return res.status(400).json({ message: "Channel not found for this job" });
    }

    const channel = channels[0];
    // Extract only the necessary data from the channel
    const simplifiedChannel = {
        id: channel.id,
        name: channel.data.name,
        members: Object.values(channel.state.members).map(member => ({
            user_id: member.user_id,
            role: member.role,
        })),
    };
    res.status(200).json({token: guestToken, channel: simplifiedChannel});

    }
    catch (error) {
        console.error("Guest login error:", error.message);
        res.status(404).json({ message: "Server error" });
    }
}));


chatRouter.post("/channels/delete_channel", authMiddleWare, validateBody(deleteChannelSchema), asyncHandler(async (req, res) => {
    try {
        const jobId  = req.body.jobId;

        // deleteChannel() only acts on completed jobs (checked internally);
        // this additionally confirms the job belonged to the caller's own
        // business before anything is torn down.
        const ownerBusinessId = await getJobHistoryBusinessId(jobId);
        if (ownerBusinessId === null || ownerBusinessId !== req.user.businessId) {
            return res.status(404).json({ message: "No such job in this business" });
        }

        await deleteChannel(jobId);

        console.log('Channel deleted');
        res.status(200).json({ success: true, message: `Channel for job ${jobId} deleted` });
    } catch (error) {
        console.error("Error deleting channel:", error.message);
        res.status(400).json({ message: "Internal server error" });
    }
}));

export { chatRouter };