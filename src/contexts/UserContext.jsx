import { createContext, useContext, useState, useEffect } from 'react';
import { watchAuth, signIn, signInEmail, signUpEmail, signOut, getUserProfile, registerDevice } from '@db';
import { deferStart } from '../lib/db/firestore/offline.js';

const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // User Stammdaten
  const [gender, setGender] = useState(() => localStorage.getItem('fitness-gender') || 'm');
  const [split, setSplit] = useState(() => localStorage.getItem('fitness-split') || 'PPL');
  const [cycleLength, setCycleLength] = useState(() => parseInt(localStorage.getItem('fitness-cycleLength') || '4', 10));
  const [defaultLocation, setDefaultLocation] = useState(() => localStorage.getItem('fitness-defaultLocation') || 'Home');

  // Körperprofil Daten
  const [age, setAge] = useState(() => parseInt(localStorage.getItem('fitness-age') || '30', 10));
  const [heightCm, setHeightCm] = useState(() => parseInt(localStorage.getItem('fitness-heightCm') || '180', 10));
  const [weightKg, setWeightKg] = useState(() => parseFloat(localStorage.getItem('fitness-weightKg') || '75.0'));

  // Anamnese-Level (Level 1 = Standard-Intake, Level 2 = reflexives Journaling)
  const [level1Complete, setLevel1Complete] = useState(() => localStorage.getItem('fitness-level1Complete') === 'true');

  // Trainingsanamnese (aktueller Stand, kein Verlauf)
  const [trainingExperience, setTrainingExperience] = useState(() => localStorage.getItem('fitness-trainingExperience') || '');
  const [trainingFrequency, setTrainingFrequency] = useState(() => localStorage.getItem('fitness-trainingFrequency') || '');
  const [trainingType, setTrainingType] = useState(() => localStorage.getItem('fitness-trainingType') || '');
  const [activityLevel, setActivityLevel] = useState(() => localStorage.getItem('fitness-activityLevel') || '');
  const [fitnessGoal, setFitnessGoal] = useState(() => localStorage.getItem('fitness-fitnessGoal') || '');
  const [secondaryGoal, setSecondaryGoal] = useState(() => localStorage.getItem('fitness-secondaryGoal') || '');
  const [energyLevel, setEnergyLevel] = useState(() => localStorage.getItem('fitness-energyLevel') || '');
  const [recoveryQuality, setRecoveryQuality] = useState(() => localStorage.getItem('fitness-recoveryQuality') || '');
  const [painNotes, setPainNotes] = useState(() => localStorage.getItem('fitness-painNotes') || '');
  const [mobilityNotes, setMobilityNotes] = useState(() => localStorage.getItem('fitness-mobilityNotes') || '');
  const [chronicConditions, setChronicConditions] = useState(() => localStorage.getItem('fitness-chronicConditions') || '');
  const [injuries, setInjuries] = useState(() => localStorage.getItem('fitness-injuries') || '');
  const [medications, setMedications] = useState(() => localStorage.getItem('fitness-medications') || '');
  const [medicalClearanceNotes, setMedicalClearanceNotes] = useState(() => localStorage.getItem('fitness-medicalClearanceNotes') || '');
  const [trainingWorking, setTrainingWorking] = useState(() => localStorage.getItem('fitness-trainingWorking') || '');
  const [trainingNotWorking, setTrainingNotWorking] = useState(() => localStorage.getItem('fitness-trainingNotWorking') || '');

  // Anamnese / Voice + War Stack
  const [submitFacts, setSubmitFacts] = useState(() => localStorage.getItem('fitness-submitFacts') || '');
  const [submitFeelings, setSubmitFeelings] = useState(() => localStorage.getItem('fitness-submitFeelings') || '');
  const [submitFocus, setSubmitFocus] = useState(() => localStorage.getItem('fitness-submitFocus') || '');
  const [submitFruit, setSubmitFruit] = useState(() => localStorage.getItem('fitness-submitFruit') || '');
  const [warStackTitle, setWarStackTitle] = useState(() => localStorage.getItem('fitness-warStackTitle') || '');
  const [warStackDomain, setWarStackDomain] = useState(() => localStorage.getItem('fitness-warStackDomain') || '');
  const [warStackSubdomain, setWarStackSubdomain] = useState(() => localStorage.getItem('fitness-warStackSubdomain') || '');
  const [warStackDoor, setWarStackDoor] = useState(() => localStorage.getItem('fitness-warStackDoor') || '');
  const [warStackTrigger, setWarStackTrigger] = useState(() => localStorage.getItem('fitness-warStackTrigger') || '');
  const [warStackNarrative, setWarStackNarrative] = useState(() => localStorage.getItem('fitness-warStackNarrative') || '');
  const [warStackValidation, setWarStackValidation] = useState(() => localStorage.getItem('fitness-warStackValidation') || '');
  const [warStackImpact, setWarStackImpact] = useState(() => localStorage.getItem('fitness-warStackImpact') || '');
  const [warStackConsequences, setWarStackConsequences] = useState(() => localStorage.getItem('fitness-warStackConsequences') || '');
  const [warStackInsights, setWarStackInsights] = useState(() => localStorage.getItem('fitness-warStackInsights') || '');
  const [warStackLesson, setWarStackLesson] = useState(() => localStorage.getItem('fitness-warStackLesson') || '');
  const [hit1Fact, setHit1Fact] = useState(() => localStorage.getItem('fitness-hit1Fact') || '');
  const [hit1Obstacle, setHit1Obstacle] = useState(() => localStorage.getItem('fitness-hit1Obstacle') || '');
  const [hit1Strike, setHit1Strike] = useState(() => localStorage.getItem('fitness-hit1Strike') || '');
  const [hit1Responsibility, setHit1Responsibility] = useState(() => localStorage.getItem('fitness-hit1Responsibility') || '');
  const [hit2Fact, setHit2Fact] = useState(() => localStorage.getItem('fitness-hit2Fact') || '');
  const [hit2Obstacle, setHit2Obstacle] = useState(() => localStorage.getItem('fitness-hit2Obstacle') || '');
  const [hit2Strike, setHit2Strike] = useState(() => localStorage.getItem('fitness-hit2Strike') || '');
  const [hit2Responsibility, setHit2Responsibility] = useState(() => localStorage.getItem('fitness-hit2Responsibility') || '');
  const [hit3Fact, setHit3Fact] = useState(() => localStorage.getItem('fitness-hit3Fact') || '');
  const [hit3Obstacle, setHit3Obstacle] = useState(() => localStorage.getItem('fitness-hit3Obstacle') || '');
  const [hit3Strike, setHit3Strike] = useState(() => localStorage.getItem('fitness-hit3Strike') || '');
  const [hit3Responsibility, setHit3Responsibility] = useState(() => localStorage.getItem('fitness-hit3Responsibility') || '');
  const [hit4Fact, setHit4Fact] = useState(() => localStorage.getItem('fitness-hit4Fact') || '');
  const [hit4Obstacle, setHit4Obstacle] = useState(() => localStorage.getItem('fitness-hit4Obstacle') || '');
  const [hit4Strike, setHit4Strike] = useState(() => localStorage.getItem('fitness-hit4Strike') || '');
  const [hit4Responsibility, setHit4Responsibility] = useState(() => localStorage.getItem('fitness-hit4Responsibility') || '');
  const [freedomHorizon, setFreedomHorizon] = useState(() => localStorage.getItem('fitness-freedomHorizon') || '');
  const [freedomFoundation, setFreedomFoundation] = useState(() => localStorage.getItem('fitness-freedomFoundation') || '');
  const [freedomFirstMiles, setFreedomFirstMiles] = useState(() => localStorage.getItem('fitness-freedomFirstMiles') || '');
  const [freedomAdditions, setFreedomAdditions] = useState(() => localStorage.getItem('fitness-freedomAdditions') || '');
  const [freedomEliminations, setFreedomEliminations] = useState(() => localStorage.getItem('fitness-freedomEliminations') || '');

  // Auth Listener
  useEffect(() => watchAuth((u) => {
    setUser(u);
    setAuthLoading(false);
  }), []);

  // Firebase Hydration (Holt die Daten aus der Cloud, wenn eingeloggt)
  useEffect(() => {
    async function fetchProfile() {
      if (!user || !user.uid) return;
      deferStart(() => registerDevice());
      try {
        const data = await getUserProfile(user.uid);
        if (data) {
          if (data.gender) setGender(data.gender === 'male' ? 'm' : data.gender === 'female' ? 'f' : data.gender);
          if (data.split) setSplit(data.split);
          if (data.cycleLength) setCycleLength(data.cycleLength);
          if (data.defaultLocation) setDefaultLocation(data.defaultLocation);
          if (data.age) setAge(data.age);
          if (data.heightCm) setHeightCm(data.heightCm);
          if (data.weightKg) setWeightKg(data.weightKg);
          if (data.trainingExperience) setTrainingExperience(data.trainingExperience);
          if (data.trainingFrequency) setTrainingFrequency(data.trainingFrequency);
          if (data.trainingType) setTrainingType(data.trainingType);
          if (data.activityLevel) setActivityLevel(data.activityLevel);
          if (data.fitnessGoal) setFitnessGoal(data.fitnessGoal);
          if (data.secondaryGoal) setSecondaryGoal(data.secondaryGoal);
          if (data.energyLevel) setEnergyLevel(data.energyLevel);
          if (data.recoveryQuality) setRecoveryQuality(data.recoveryQuality);
          if (data.painNotes) setPainNotes(data.painNotes);
          if (data.mobilityNotes) setMobilityNotes(data.mobilityNotes);
          if (data.chronicConditions) setChronicConditions(data.chronicConditions);
          if (data.injuries) setInjuries(data.injuries);
          if (data.medications) setMedications(data.medications);
          if (data.medicalClearanceNotes) setMedicalClearanceNotes(data.medicalClearanceNotes);
          if (data.trainingWorking) setTrainingWorking(data.trainingWorking);
          if (data.trainingNotWorking) setTrainingNotWorking(data.trainingNotWorking);
          if (data.submitFacts) setSubmitFacts(data.submitFacts);
          if (data.submitFeelings) setSubmitFeelings(data.submitFeelings);
          if (data.submitFocus) setSubmitFocus(data.submitFocus);
          if (data.submitFruit) setSubmitFruit(data.submitFruit);
          if (data.warStackTitle) setWarStackTitle(data.warStackTitle);
          if (data.warStackDomain) setWarStackDomain(data.warStackDomain);
          if (data.warStackSubdomain) setWarStackSubdomain(data.warStackSubdomain);
          if (data.warStackDoor) setWarStackDoor(data.warStackDoor);
          if (data.warStackTrigger) setWarStackTrigger(data.warStackTrigger);
          if (data.warStackNarrative) setWarStackNarrative(data.warStackNarrative);
          if (data.warStackValidation) setWarStackValidation(data.warStackValidation);
          if (data.warStackImpact) setWarStackImpact(data.warStackImpact);
          if (data.warStackConsequences) setWarStackConsequences(data.warStackConsequences);
          if (data.warStackInsights) setWarStackInsights(data.warStackInsights);
          if (data.warStackLesson) setWarStackLesson(data.warStackLesson);
          if (data.hit1Fact) setHit1Fact(data.hit1Fact);
          if (data.hit1Obstacle) setHit1Obstacle(data.hit1Obstacle);
          if (data.hit1Strike) setHit1Strike(data.hit1Strike);
          if (data.hit1Responsibility) setHit1Responsibility(data.hit1Responsibility);
          if (data.hit2Fact) setHit2Fact(data.hit2Fact);
          if (data.hit2Obstacle) setHit2Obstacle(data.hit2Obstacle);
          if (data.hit2Strike) setHit2Strike(data.hit2Strike);
          if (data.hit2Responsibility) setHit2Responsibility(data.hit2Responsibility);
          if (data.hit3Fact) setHit3Fact(data.hit3Fact);
          if (data.hit3Obstacle) setHit3Obstacle(data.hit3Obstacle);
          if (data.hit3Strike) setHit3Strike(data.hit3Strike);
          if (data.hit3Responsibility) setHit3Responsibility(data.hit3Responsibility);
          if (data.hit4Fact) setHit4Fact(data.hit4Fact);
          if (data.hit4Obstacle) setHit4Obstacle(data.hit4Obstacle);
          if (data.hit4Strike) setHit4Strike(data.hit4Strike);
          if (data.hit4Responsibility) setHit4Responsibility(data.hit4Responsibility);
          if (data.freedomHorizon) setFreedomHorizon(data.freedomHorizon);
          if (data.freedomFoundation) setFreedomFoundation(data.freedomFoundation);
          if (data.freedomFirstMiles) setFreedomFirstMiles(data.freedomFirstMiles);
          if (data.freedomAdditions) setFreedomAdditions(data.freedomAdditions);
          if (data.freedomEliminations) setFreedomEliminations(data.freedomEliminations);
          if (data.level1Complete) setLevel1Complete(data.level1Complete);
        }
      } catch (err) {
        console.error("Fehler bei Hydration:", err);
      }
    }
    fetchProfile();
  }, [user]);

  // Lokale Persistenz (Fallback)
  useEffect(() => { localStorage.setItem('fitness-gender', gender) }, [gender]);
  useEffect(() => { localStorage.setItem('fitness-split', split) }, [split]);
  useEffect(() => { localStorage.setItem('fitness-cycleLength', cycleLength) }, [cycleLength]);
  useEffect(() => { localStorage.setItem('fitness-defaultLocation', defaultLocation) }, [defaultLocation]);
  useEffect(() => { localStorage.setItem('fitness-age', age) }, [age]);
  useEffect(() => { localStorage.setItem('fitness-heightCm', heightCm) }, [heightCm]);
  useEffect(() => { localStorage.setItem('fitness-weightKg', weightKg) }, [weightKg]);
  useEffect(() => { localStorage.setItem('fitness-trainingExperience', trainingExperience) }, [trainingExperience]);
  useEffect(() => { localStorage.setItem('fitness-trainingFrequency', trainingFrequency) }, [trainingFrequency]);
  useEffect(() => { localStorage.setItem('fitness-trainingType', trainingType) }, [trainingType]);
  useEffect(() => { localStorage.setItem('fitness-activityLevel', activityLevel) }, [activityLevel]);
  useEffect(() => { localStorage.setItem('fitness-fitnessGoal', fitnessGoal) }, [fitnessGoal]);
  useEffect(() => { localStorage.setItem('fitness-secondaryGoal', secondaryGoal) }, [secondaryGoal]);
  useEffect(() => { localStorage.setItem('fitness-energyLevel', energyLevel) }, [energyLevel]);
  useEffect(() => { localStorage.setItem('fitness-recoveryQuality', recoveryQuality) }, [recoveryQuality]);
  useEffect(() => { localStorage.setItem('fitness-painNotes', painNotes) }, [painNotes]);
  useEffect(() => { localStorage.setItem('fitness-mobilityNotes', mobilityNotes) }, [mobilityNotes]);
  useEffect(() => { localStorage.setItem('fitness-chronicConditions', chronicConditions) }, [chronicConditions]);
  useEffect(() => { localStorage.setItem('fitness-injuries', injuries) }, [injuries]);
  useEffect(() => { localStorage.setItem('fitness-medications', medications) }, [medications]);
  useEffect(() => { localStorage.setItem('fitness-medicalClearanceNotes', medicalClearanceNotes) }, [medicalClearanceNotes]);
  useEffect(() => { localStorage.setItem('fitness-trainingWorking', trainingWorking) }, [trainingWorking]);
  useEffect(() => { localStorage.setItem('fitness-trainingNotWorking', trainingNotWorking) }, [trainingNotWorking]);
  useEffect(() => { localStorage.setItem('fitness-submitFacts', submitFacts) }, [submitFacts]);
  useEffect(() => { localStorage.setItem('fitness-submitFeelings', submitFeelings) }, [submitFeelings]);
  useEffect(() => { localStorage.setItem('fitness-submitFocus', submitFocus) }, [submitFocus]);
  useEffect(() => { localStorage.setItem('fitness-submitFruit', submitFruit) }, [submitFruit]);
  useEffect(() => { localStorage.setItem('fitness-warStackTitle', warStackTitle) }, [warStackTitle]);
  useEffect(() => { localStorage.setItem('fitness-warStackDomain', warStackDomain) }, [warStackDomain]);
  useEffect(() => { localStorage.setItem('fitness-warStackSubdomain', warStackSubdomain) }, [warStackSubdomain]);
  useEffect(() => { localStorage.setItem('fitness-warStackDoor', warStackDoor) }, [warStackDoor]);
  useEffect(() => { localStorage.setItem('fitness-warStackTrigger', warStackTrigger) }, [warStackTrigger]);
  useEffect(() => { localStorage.setItem('fitness-warStackNarrative', warStackNarrative) }, [warStackNarrative]);
  useEffect(() => { localStorage.setItem('fitness-warStackValidation', warStackValidation) }, [warStackValidation]);
  useEffect(() => { localStorage.setItem('fitness-warStackImpact', warStackImpact) }, [warStackImpact]);
  useEffect(() => { localStorage.setItem('fitness-warStackConsequences', warStackConsequences) }, [warStackConsequences]);
  useEffect(() => { localStorage.setItem('fitness-warStackInsights', warStackInsights) }, [warStackInsights]);
  useEffect(() => { localStorage.setItem('fitness-warStackLesson', warStackLesson) }, [warStackLesson]);
  useEffect(() => { localStorage.setItem('fitness-hit1Fact', hit1Fact) }, [hit1Fact]);
  useEffect(() => { localStorage.setItem('fitness-hit1Obstacle', hit1Obstacle) }, [hit1Obstacle]);
  useEffect(() => { localStorage.setItem('fitness-hit1Strike', hit1Strike) }, [hit1Strike]);
  useEffect(() => { localStorage.setItem('fitness-hit1Responsibility', hit1Responsibility) }, [hit1Responsibility]);
  useEffect(() => { localStorage.setItem('fitness-hit2Fact', hit2Fact) }, [hit2Fact]);
  useEffect(() => { localStorage.setItem('fitness-hit2Obstacle', hit2Obstacle) }, [hit2Obstacle]);
  useEffect(() => { localStorage.setItem('fitness-hit2Strike', hit2Strike) }, [hit2Strike]);
  useEffect(() => { localStorage.setItem('fitness-hit2Responsibility', hit2Responsibility) }, [hit2Responsibility]);
  useEffect(() => { localStorage.setItem('fitness-hit3Fact', hit3Fact) }, [hit3Fact]);
  useEffect(() => { localStorage.setItem('fitness-hit3Obstacle', hit3Obstacle) }, [hit3Obstacle]);
  useEffect(() => { localStorage.setItem('fitness-hit3Strike', hit3Strike) }, [hit3Strike]);
  useEffect(() => { localStorage.setItem('fitness-hit3Responsibility', hit3Responsibility) }, [hit3Responsibility]);
  useEffect(() => { localStorage.setItem('fitness-hit4Fact', hit4Fact) }, [hit4Fact]);
  useEffect(() => { localStorage.setItem('fitness-hit4Obstacle', hit4Obstacle) }, [hit4Obstacle]);
  useEffect(() => { localStorage.setItem('fitness-hit4Strike', hit4Strike) }, [hit4Strike]);
  useEffect(() => { localStorage.setItem('fitness-hit4Responsibility', hit4Responsibility) }, [hit4Responsibility]);
  useEffect(() => { localStorage.setItem('fitness-freedomHorizon', freedomHorizon) }, [freedomHorizon]);
  useEffect(() => { localStorage.setItem('fitness-freedomFoundation', freedomFoundation) }, [freedomFoundation]);
  useEffect(() => { localStorage.setItem('fitness-freedomFirstMiles', freedomFirstMiles) }, [freedomFirstMiles]);
  useEffect(() => { localStorage.setItem('fitness-freedomAdditions', freedomAdditions) }, [freedomAdditions]);
  useEffect(() => { localStorage.setItem('fitness-freedomEliminations', freedomEliminations) }, [freedomEliminations]);
  useEffect(() => { localStorage.setItem('fitness-level1Complete', level1Complete) }, [level1Complete]);

  const value = {
    user, authLoading,
    gender, setGender,
    split, setSplit,
    cycleLength, setCycleLength,
    defaultLocation, setDefaultLocation,
    age, setAge,
    heightCm, setHeightCm,
    weightKg, setWeightKg,
    trainingExperience, setTrainingExperience,
    trainingFrequency, setTrainingFrequency,
    trainingType, setTrainingType,
    activityLevel, setActivityLevel,
    fitnessGoal, setFitnessGoal,
    secondaryGoal, setSecondaryGoal,
    energyLevel, setEnergyLevel,
    recoveryQuality, setRecoveryQuality,
    painNotes, setPainNotes,
    mobilityNotes, setMobilityNotes,
    chronicConditions, setChronicConditions,
    injuries, setInjuries,
    medications, setMedications,
    medicalClearanceNotes, setMedicalClearanceNotes,
    trainingWorking, setTrainingWorking,
    trainingNotWorking, setTrainingNotWorking,
    submitFacts, setSubmitFacts,
    submitFeelings, setSubmitFeelings,
    submitFocus, setSubmitFocus,
    submitFruit, setSubmitFruit,
    warStackTitle, setWarStackTitle,
    warStackDomain, setWarStackDomain,
    warStackSubdomain, setWarStackSubdomain,
    warStackDoor, setWarStackDoor,
    warStackTrigger, setWarStackTrigger,
    warStackNarrative, setWarStackNarrative,
    warStackValidation, setWarStackValidation,
    warStackImpact, setWarStackImpact,
    warStackConsequences, setWarStackConsequences,
    warStackInsights, setWarStackInsights,
    warStackLesson, setWarStackLesson,
    hit1Fact, setHit1Fact,
    hit1Obstacle, setHit1Obstacle,
    hit1Strike, setHit1Strike,
    hit1Responsibility, setHit1Responsibility,
    hit2Fact, setHit2Fact,
    hit2Obstacle, setHit2Obstacle,
    hit2Strike, setHit2Strike,
    hit2Responsibility, setHit2Responsibility,
    hit3Fact, setHit3Fact,
    hit3Obstacle, setHit3Obstacle,
    hit3Strike, setHit3Strike,
    hit3Responsibility, setHit3Responsibility,
    hit4Fact, setHit4Fact,
    hit4Obstacle, setHit4Obstacle,
    hit4Strike, setHit4Strike,
    hit4Responsibility, setHit4Responsibility,
    freedomHorizon, setFreedomHorizon,
    freedomFoundation, setFreedomFoundation,
    freedomFirstMiles, setFreedomFirstMiles,
    freedomAdditions, setFreedomAdditions,
    freedomEliminations, setFreedomEliminations,
    level1Complete, setLevel1Complete,
    signIn, signInEmail, signUpEmail, signOut
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export const useUser = () => useContext(UserContext);
