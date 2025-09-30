const express = require('express');
const router = express.Router();
const passport = require('passport');
const { createCv, getCvById, updateCv, exportPdf, getAllCVs, deleteCv } = require('../controllers/cvController');
const { candidateOnly } = require('../middleware/auth.middleware');

// POST /api/cvs - create CV (private)
router.post('/', passport.authenticate('jwt', { session: false }), candidateOnly, createCv);

// GET /api/cvs - get all CVs (public)
router.get('/', getAllCVs);

// GET /api/cvs/:id - get CV by id (private)
router.get('/:id', passport.authenticate('jwt', { session: false }), candidateOnly, getCvById);

// PUT /api/cvs/:id - update CV (private)
router.put('/:id', passport.authenticate('jwt', { session: false }), candidateOnly, updateCv);

// DELETE /api/cvs/:id - delete CV (private)
router.delete('/:id', passport.authenticate('jwt', { session: false }), candidateOnly, deleteCv);

// POST /api/cvs/:id/export-pdf - export CV as PDF (private)
router.post('/:id/export-pdf', passport.authenticate('jwt', { session: false }), candidateOnly, exportPdf);

module.exports = router;
