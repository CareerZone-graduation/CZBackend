import CandidateProfile from '../models/CandidateProfile.js';

/**
 * Calculate profile completeness based on profile data
 * @param {Object} profile - Candidate profile object
 * @returns {Object} - Completeness object with flags and percentage
 */
export const calculateProfileCompleteness = (profile) => {
  if (!profile) {
    return {
      hasBasicInfo: false,
      hasExperience: false,
      hasEducation: false,
      hasSkills: false,
      hasCV: false,
      percentage: 0
    };
  }

  // Define weights for each section (total = 100%)
  const weights = {
    basicInfo: 40,    // Most important
    experience: 15,   // Optional for freshers
    education: 15,    // Optional
    skills: 15,       // Recommended
    cv: 15            // Recommended
  };

  // Check completeness for each section
  const checks = {
    hasBasicInfo: !!(profile.phone && profile.bio && profile.avatar),
    hasExperience: profile.experiences?.length > 0,
    hasEducation: profile.educations?.length > 0,
    hasSkills: profile.skills?.length >= 3,
    hasCV: profile.cvs?.length > 0
  };

  // Calculate percentage based on weights
  let percentage = 0;
  if (checks.hasBasicInfo) percentage += weights.basicInfo;
  if (checks.hasExperience) percentage += weights.experience;
  if (checks.hasEducation) percentage += weights.education;
  if (checks.hasSkills) percentage += weights.skills;
  if (checks.hasCV) percentage += weights.cv;

  return {
    ...checks,
    percentage: Math.round(percentage)
  };
};

/**
 * Update profile completeness in database
 * @param {String} profileId - Profile ID
 * @param {Object} profile - Profile object (optional, if not provided will fetch)
 */
export const updateProfileCompleteness = async (profileId, profile = null) => {
  try {
    const profileData = profile || await CandidateProfile.findById(profileId);
    if (!profileData) {
      throw new Error('Profile not found');
    }

    const completeness = calculateProfileCompleteness(profileData);
    
    profileData.profileCompleteness = completeness;
    await profileData.save();

    return completeness;
  } catch (error) {
    console.error('Error updating profile completeness:', error);
    throw error;
  }
};

/**
 * Get onboarding status
 * GET /api/candidate/onboarding/status
 */
export const getOnboardingStatus = async (req, res) => {
  try {
    const userId = req.user._id;

    const profile = await CandidateProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found. Please create your profile first.'
      });
    }

    // Calculate latest profile completeness
    const completeness = calculateProfileCompleteness(profile);
    
    // Update if changed
    if (JSON.stringify(completeness) !== JSON.stringify(profile.profileCompleteness)) {
      profile.profileCompleteness = completeness;
      await profile.save();
    }

    res.status(200).json({
      success: true,
      data: {
        isCompleted: profile.onboarding?.isCompleted || false,
        currentStep: profile.onboarding?.currentStep || 0,
        completedSteps: profile.onboarding?.completedSteps || [],
        skippedSteps: profile.onboarding?.skippedSteps || [],
        completionPercentage: profile.onboarding?.completionPercentage || 0,
        profileCompleteness: completeness,
        lastUpdated: profile.onboarding?.lastUpdated
      }
    });
  } catch (error) {
    console.error('Error getting onboarding status:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting onboarding status',
      error: error.message
    });
  }
};

/**
 * Update onboarding step
 * PATCH /api/candidate/onboarding/step
 * Body: { currentStep, completedStep, skipped }
 */
export const updateOnboardingStep = async (req, res) => {
  try {
    const userId = req.user._id;
    const { currentStep, completedStep, skipped } = req.body;

    const profile = await CandidateProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Initialize onboarding if not exists
    if (!profile.onboarding) {
      profile.onboarding = {
        isCompleted: false,
        currentStep: 0,
        completedSteps: [],
        skippedSteps: [],
        completionPercentage: 0,
        lastUpdated: Date.now()
      };
    }

    // Update current step
    if (currentStep !== undefined) {
      profile.onboarding.currentStep = currentStep;
    }

    // Add to completed steps
    if (completedStep && !profile.onboarding.completedSteps.includes(completedStep)) {
      profile.onboarding.completedSteps.push(completedStep);
      // Remove from skipped if was skipped before
      profile.onboarding.skippedSteps = profile.onboarding.skippedSteps.filter(
        step => step !== completedStep
      );
    }

    // Add to skipped steps
    if (skipped && !profile.onboarding.skippedSteps.includes(currentStep)) {
      profile.onboarding.skippedSteps.push(currentStep);
    }

    // Calculate completion percentage (based on completed steps out of 5)
    const totalSteps = 5;
    const completedCount = profile.onboarding.completedSteps.length;
    profile.onboarding.completionPercentage = Math.round((completedCount / totalSteps) * 100);

    // Update timestamp
    profile.onboarding.lastUpdated = Date.now();

    await profile.save();

    // Recalculate profile completeness
    const completeness = await updateProfileCompleteness(profile._id, profile);

    res.status(200).json({
      success: true,
      message: 'Onboarding step updated successfully',
      data: {
        onboarding: profile.onboarding,
        profileCompleteness: completeness
      }
    });
  } catch (error) {
    console.error('Error updating onboarding step:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating onboarding step',
      error: error.message
    });
  }
};

/**
 * Skip entire onboarding
 * PATCH /api/candidate/onboarding/skip
 */
export const skipOnboarding = async (req, res) => {
  try {
    const userId = req.user._id;

    const profile = await CandidateProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Mark all remaining steps as skipped
    const allSteps = [1, 2, 3, 4, 5];
    profile.onboarding = {
      isCompleted: true, // Mark as completed even though skipped
      currentStep: 5,
      completedSteps: profile.onboarding?.completedSteps || [],
      skippedSteps: allSteps.filter(step => 
        !profile.onboarding?.completedSteps?.includes(step)
      ),
      completionPercentage: profile.onboarding?.completionPercentage || 0,
      lastUpdated: Date.now()
    };

    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Onboarding skipped successfully',
      data: {
        onboarding: profile.onboarding
      }
    });
  } catch (error) {
    console.error('Error skipping onboarding:', error);
    res.status(500).json({
      success: false,
      message: 'Error skipping onboarding',
      error: error.message
    });
  }
};

/**
 * Complete onboarding
 * POST /api/candidate/onboarding/complete
 */
export const completeOnboarding = async (req, res) => {
  try {
    const userId = req.user._id;

    const profile = await CandidateProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Mark onboarding as completed
    if (!profile.onboarding) {
      profile.onboarding = {
        isCompleted: true,
        currentStep: 5,
        completedSteps: [],
        skippedSteps: [],
        completionPercentage: 0,
        lastUpdated: Date.now()
      };
    } else {
      profile.onboarding.isCompleted = true;
      profile.onboarding.currentStep = 5;
      profile.onboarding.lastUpdated = Date.now();
    }

    await profile.save();

    // Calculate final profile completeness
    const completeness = await updateProfileCompleteness(profile._id, profile);

    res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully! 🎉',
      data: {
        onboarding: profile.onboarding,
        profileCompleteness: completeness
      }
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing onboarding',
      error: error.message
    });
  }
};
