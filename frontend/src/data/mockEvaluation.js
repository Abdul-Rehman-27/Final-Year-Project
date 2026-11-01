// Starter benchmark: 30 parallel English/Urdu pairs (60 queries) with ground-truth labels.
// The full 400-query dataset (200 EN + 200 UR) is built in Phase 4; admins add the rest from the UI.
const PAIRS = [
  // triage -> expected department
  ["triage", "I have chest pain that moves to my left arm", "میرے سینے میں درد ہے جو بائیں بازو تک جاتا ہے", "Cardiology"],
  ["triage", "My child has had a high fever and cough for three days", "میرے بچے کو تین دن سے تیز بخار اور کھانسی ہے", "Pediatrics"],
  ["triage", "I get itchy red rashes on my skin after eating fish", "مچھلی کھانے کے بعد میری جلد پر خارش والے سرخ دانے نکل آتے ہیں", "Dermatology"],
  ["triage", "I feel short of breath at night and my feet are swollen", "رات کو میرا سانس پھولتا ہے اور پاؤں سوج جاتے ہیں", "Cardiology"],
  ["triage", "My knee hurts badly when I climb stairs", "سیڑھیاں چڑھتے وقت میرے گھٹنے میں شدید درد ہوتا ہے", "Orthopedics"],
  ["triage", "I have constant stomach pain and acidity after meals", "کھانے کے بعد مجھے مسلسل پیٹ درد اور تیزابیت ہوتی ہے", "Gastroenterology"],
  // disease detection -> expected disease
  ["diseaseDetection", "I am always thirsty and urinate very often", "مجھے ہر وقت پیاس لگتی ہے اور بار بار پیشاب آتا ہے", "Diabetes Mellitus"],
  ["diseaseDetection", "Severe headache with sensitivity to light and nausea", "شدید سر درد کے ساتھ روشنی سے تکلیف اور متلی", "Migraine"],
  ["diseaseDetection", "Burning while urinating and pain in the lower belly", "پیشاب میں جلن اور پیٹ کے نچلے حصے میں درد", "Urinary Tract Infection"],
  ["diseaseDetection", "My blood pressure readings are always high", "میرا بلڈ پریشر ہمیشہ زیادہ رہتا ہے", "Hypertension"],
  ["diseaseDetection", "Dry cough, fever and body aches since yesterday", "کل سے خشک کھانسی، بخار اور جسم میں درد ہے", "Influenza"],
  ["diseaseDetection", "Yellow eyes and tiredness for two weeks", "دو ہفتوں سے آنکھیں پیلی اور کمزوری ہے", "Hepatitis"],
  // doctor information -> expected department / info type
  ["doctorInfo", "Which doctor treats heart problems?", "دل کے امراض کا علاج کون سا ڈاکٹر کرتا ہے؟", "Cardiology"],
  ["doctorInfo", "Is there a skin specialist available?", "کیا جلد کا کوئی ماہر ڈاکٹر دستیاب ہے؟", "Dermatology"],
  ["doctorInfo", "Who is the children's doctor in the hospital?", "ہسپتال میں بچوں کا ڈاکٹر کون ہے؟", "Pediatrics"],
  ["doctorInfo", "What is the consultation fee of the cardiologist?", "امراضِ قلب کے ڈاکٹر کی مشاورتی فیس کتنی ہے؟", "Fee: Cardiology"],
  ["doctorInfo", "Which days does the skin doctor sit?", "جلد کے ڈاکٹر کس دن بیٹھتے ہیں؟", "Schedule: Dermatology"],
  ["doctorInfo", "Does the hospital have a dentist?", "کیا ہسپتال میں دانتوں کا ڈاکٹر ہے؟", "Dentistry"],
  // appointment -> expected intent
  ["appointment", "I want to book an appointment with a cardiologist tomorrow", "مجھے کل امراضِ قلب کے ڈاکٹر سے اپائنٹمنٹ بُک کرنی ہے", "Book appointment"],
  ["appointment", "Please cancel my appointment for Friday", "براہ کرم جمعہ کی میری اپائنٹمنٹ منسوخ کر دیں", "Cancel appointment"],
  ["appointment", "Can I move my appointment to next week?", "کیا میں اپنی اپائنٹمنٹ اگلے ہفتے کر سکتا ہوں؟", "Reschedule appointment"],
  ["appointment", "Is Dr. Sara Khan available on Monday morning?", "کیا ڈاکٹر سارہ خان پیر کی صبح دستیاب ہیں؟", "Check availability"],
  ["appointment", "Show me my upcoming appointments", "مجھے میری آنے والی اپائنٹمنٹس دکھائیں", "View appointments"],
  ["appointment", "I need an appointment for my son with a children's doctor", "مجھے اپنے بیٹے کے لیے بچوں کے ڈاکٹر کی اپائنٹمنٹ چاہیے", "Book appointment"],
  // hospital information -> expected info topic
  ["hospitalInfo", "What are the hospital visiting hours?", "ہسپتال میں ملاقات کے اوقات کیا ہیں؟", "Visiting hours"],
  ["hospitalInfo", "Is the pharmacy open at night?", "کیا میڈیکل سٹور رات کو کھلا ہوتا ہے؟", "Pharmacy timings"],
  ["hospitalInfo", "Do you have a laboratory for blood tests?", "کیا آپ کے پاس خون کے ٹیسٹ کے لیے لیبارٹری ہے؟", "Laboratory services"],
  ["hospitalInfo", "Where is the emergency entrance?", "ایمرجنسی کا داخلی راستہ کہاں ہے؟", "Emergency entrance"],
  ["hospitalInfo", "How can I get my lab report?", "میں اپنی لیب رپورٹ کیسے حاصل کر سکتا ہوں؟", "Lab report collection"],
  ["hospitalInfo", "Is parking available at the hospital?", "کیا ہسپتال میں پارکنگ دستیاب ہے؟", "Parking"],
];

export const INITIAL_QUERIES = PAIRS.flatMap(([category, en, ur, truth], i) => [
  { id: i * 2 + 1, lang: "en", category, query: en, truth },
  { id: i * 2 + 2, lang: "ur", category, query: ur, truth },
]);
