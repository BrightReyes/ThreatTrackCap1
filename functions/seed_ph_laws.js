const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const phLaws = [
  // 1. THEFT / SNATCHING
  {
    title: "The Revised Penal Code - Theft",
    referenceNumber: "Act No. 3815, Art. 308",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "theft_snatching",
    content: "Art. 308. Who are liable for theft. — Theft is committed by any person who, with intent to gain but without violence against or intimidation of persons nor force upon things, shall take personal property of another without the latter's consent. Operational Directive: First responders must secure the perimeter to prevent the escape of the suspect and immediately retrieve stolen items if the suspect is apprehended in flagrante delicto.",
  },
  {
    title: "Anti-Fencing Law of 1979",
    referenceNumber: "Presidential Decree No. 1612",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "theft_snatching",
    content: "Section 2. Definition of Terms. - Fencing is the act of any person who, with intent to gain for himself or for another, shall buy, receive, possess, keep, acquire, conceal, sell or dispose of, or shall buy and sell, or in any other manner deal in any article, item, object or anything of value which he knows, or should be known to him, to have been derived from the proceeds of the crime of robbery or theft. Operational Directive: Pawnshops and second-hand dealers in the vicinity must be inspected for recently stolen goods.",
  },

  // 2. ROBBERY / HOLDUP
  {
    title: "The Revised Penal Code - Robbery",
    referenceNumber: "Act No. 3815, Art. 293",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "robbery_holdup",
    content: "Art. 293. Who are guilty of robbery. — Any person who, with intent to gain, shall take any personal property belonging to another, by means of violence against or intimidation of any person, or using force upon anything, shall be guilty of robbery. Operational Directive: Immediate deployment of armed police units is required. Barangay Tanods should act strictly as perimeter support and crowd control to avoid engaging armed suspects.",
  },
  {
    title: "New Anti-Carnapping Act of 2016",
    referenceNumber: "Republic Act No. 10883",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "robbery_holdup",
    content: "Section 3. Carnapping is the taking, with intent to gain, of a motor vehicle belonging to another without the latter's consent, or by means of violence against or intimidation of persons, or by using force upon things. Operational Directive: Establish immediate checkpoints on major exit routes in coordination with the Highway Patrol Group (HPG).",
  },

  // 3. PHYSICAL ASSAULT / INJURY
  {
    title: "The Revised Penal Code - Physical Injuries",
    referenceNumber: "Act No. 3815, Art. 262-266",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "physical_assault_injury",
    content: "Art. 265. Less serious physical injuries. — Any person who shall inflict upon another physical injuries not described in the preceding articles, but which shall incapacitate the offended party for labor for ten days or more, or shall require medical assistance for the same period, shall be guilty of less serious physical injuries. Operational Directive: Priority is securing medical assistance (EMS/Ambulance) for the victim before pursuing suspects.",
  },
  {
    title: "Safe Spaces Act (Bawal Bastos Law)",
    referenceNumber: "Republic Act No. 11313",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "physical_assault_injury",
    content: "An Act Defining Gender-Based Sexual Harassment in Streets, Public Spaces, Online, Workplaces, and Educational or Training Institutions. Sec. 11: Specific Acts and Penalties for Gender-Based Streets and Public Spaces Sexual Harassment. Operational Directive: First responders must separate the victim from the offender immediately and ensure a gender-sensitive approach when taking statements.",
  },

  // 4. DOMESTIC VIOLENCE
  {
    title: "Anti-Violence Against Women and Their Children Act of 2004",
    referenceNumber: "Republic Act No. 9262",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "domestic_violence",
    content: "Section 3. Violence Against Women and Their Children (VAWC) refers to any act or a series of acts committed by any person against a woman who is his wife, former wife, or against a woman with whom the person has or had a sexual or dating relationship. Operational Directive: Barangay officials must immediately issue a Barangay Protection Order (BPO) if requested and secure the victims in a safe house or DSWD facility.",
  },

  // 5. DRUG-RELATED ACTIVITY
  {
    title: "Comprehensive Dangerous Drugs Act of 2002",
    referenceNumber: "Republic Act No. 9165",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "drug_related_activity",
    content: "Section 5. Sale, Trading, Administration, Dispensation, Delivery, Distribution and Transportation of Dangerous Drugs and/or Controlled Precursors and Essential Chemicals. Operational Directive: Barangay Tanods must NOT engage directly to avoid compromising PDEA/PNP buy-bust operations. Report all intel strictly to the local PNP Drug Enforcement Unit.",
  },

  // 6. PUBLIC DISTURBANCE
  {
    title: "The Revised Penal Code - Public Disturbances",
    referenceNumber: "Act No. 3815, Art. 153",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "public_disturbance",
    content: "Art. 153. Tumults and other disturbances of public order. — The penalty of arresto mayor in its medium period to prision correccional in its minimum period and a fine not exceeding 1,000 pesos shall be imposed upon any person who shall cause any serious disturbance in a public place, office, or establishment. Operational Directive: Barangay Tanods are authorized to use maximum tolerance and de-escalation techniques before requesting police intervention.",
  },
  {
    title: "The Public Assembly Act of 1985",
    referenceNumber: "Batas Pambansa Blg. 880",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "public_disturbance",
    content: "Section 9. Law enforcement agencies shall not interfere with the holding of a public assembly. However, to adequately ensure public safety, a law enforcement contingent under the command of a responsible police officer may be detailed and stationed in a place at least one hundred (100) meters away from the area of activity. Operational Directive: Ensure civil rights are respected; police should maintain a 100-meter distance unless violence erupts.",
  },

  // 7. VANDALISM / PROPERTY DAMAGE
  {
    title: "The Revised Penal Code - Malicious Mischief",
    referenceNumber: "Act No. 3815, Art. 327",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "vandalism_property_damage",
    content: "Art. 327. Who are liable for malicious mischief. — Any person who shall deliberately cause to the property of another any damage not falling within the terms of the next preceding chapter shall be guilty of malicious mischief. Operational Directive: Document the extent of the damage with photographs before cleanup or repair begins. Utilize local CCTV to identify perpetrators.",
  },

  // 8. TRAFFIC ACCIDENT
  {
    title: "Land Transportation and Traffic Code",
    referenceNumber: "Republic Act No. 4136",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "traffic_accident",
    content: "Section 55. Duty of driver in case of accident. — In the event that any accident should occur as a result of the operation of a motor vehicle upon a highway, the driver shall stop immediately, and, if requested by any person present, shall show his driver's license. Operational Directive: Local traffic enforcers must secure the crash site with early warning devices and divert traffic to prevent secondary collisions.",
  },
  {
    title: "Anti-Drunk and Drugged Driving Act of 2013",
    referenceNumber: "Republic Act No. 10586",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "traffic_accident",
    content: "Section 5. Punishable Act. - It shall be unlawful for any person to drive a motor vehicle while under the influence of alcohol, dangerous drugs and/or other similar substances. Operational Directive: If intoxication is suspected, immediately request a Breathalyzer from the responding PNP Traffic Investigator.",
  },

  // 9. ILLEGAL WEAPONS
  {
    title: "Comprehensive Firearms and Ammunition Regulation Act",
    referenceNumber: "Republic Act No. 10591",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "illegal_weapons",
    content: "Section 28. Penalties for Illegal Possession of Firearms. — The penalty of prision mayor in its medium period shall be imposed upon any person who shall unlawfully acquire or possess a small arm. Operational Directive: Unarmed barangay officials must retreat and immediately escalate to the PNP SWAT or armed response units. Do not attempt apprehension without firearms.",
  },
  {
    title: "Illegal Possession of Bladed, Pointed or Blunt Weapons",
    referenceNumber: "Batas Pambansa Blg. 6",
    type: "national_law",
    status: "published",
    source: "Official Gazette of the Republic of the Philippines",
    crimeType: "illegal_weapons",
    content: "Section 1. It is unlawful for any person to carry outside of his residence any bladed, pointed or blunt weapon such as knife, spear, pana, dagger, bolo, barong, kris, or chako, except where such articles are being used as necessary tools for legitimate business. Operational Directive: Confiscate weapons using safe disarming techniques. If the suspect resists, maintain distance and call police.",
  },

  // 10. SUSPICIOUS ACTIVITY
  {
    title: "PNP Standard Operational Procedure (SOP) on Spot Checks",
    referenceNumber: "PNP POP Rule 10",
    type: "standard_protocol",
    status: "published",
    source: "Philippine National Police Manual",
    crimeType: "suspicious_activity",
    content: "Rule 10. Spot Checks / Accosting and Pat-Down Searches. Justifiable Circumstances: The police officer must observe unusual conduct which leads him reasonably to conclude in light of his experience that criminal activity may be afoot. Operational Directive: Approach suspects non-aggressively, ask for identification politely, and only conduct a pat-down (Terry Stop) if there is reasonable suspicion they are armed and dangerous.",
  }
];

async function seedLaws() {
  console.log(`Starting to seed ${phLaws.length} Philippine National Laws into 'ai_knowledge' collection...`);
  
  const batch = db.batch();
  let count = 0;

  for (const law of phLaws) {
    const docRef = db.collection("ai_knowledge").doc();
    batch.set(docRef, {
      ...law,
      version: 1,
      updatedBy: "system_seeder",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    count++;
  }

  try {
    await batch.commit();
    console.log(`✅ Successfully seeded ${count} laws into the Firestore database!`);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
  }
}

seedLaws();
