import express from 'express';
import { createPartnerInvite, validateInviteToken, acceptInvite } from '../controllers/partnerController.js';
const router = express.Router();


router.post('/invite', createPartnerInvite);
router.get('/validate/:token', validateInviteToken);
router.post('/accept', acceptInvite);


export default router;