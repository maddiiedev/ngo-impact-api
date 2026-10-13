import NGO from '../models/NGO.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ngoRole('owner', 'admin') -> only those roles
// ngoRole()                 -> any member of the NGO
export const ngoRole = (...allowed) =>
  asyncHandler(async (req, res, next) => {
    const ngoId = req.params.ngoId || req.params.id;

    const ngo = await NGO.findById(ngoId);
    if (!ngo) throw new AppError('NGO not found', 404);
    if (ngo.status === 'suspended') throw new AppError('This NGO has been suspended', 403);

    const membership = ngo.members.find((m) => String(m.user) === String(req.user._id));
    if (!membership || (allowed.length && !allowed.includes(membership.role))) {
      throw new AppError('You do not have permission to manage this NGO', 403);
    }

    req.ngo = ngo;
    req.membership = membership;
    next();
  });