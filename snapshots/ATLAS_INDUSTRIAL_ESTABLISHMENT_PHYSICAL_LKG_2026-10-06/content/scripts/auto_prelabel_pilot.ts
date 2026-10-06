import fs from 'fs';

const PILOT_PATH = 'phase2c_gold_pilot.json';

// Basic list of entities to mock the pre-labeler
const KNOWN_ENTITIES = [
    { id: 'entity_fito_paez', keywords: ['fito', 'paez', 'páez'] },
    { id: 'entity_the_beatles', keywords: ['beatles', 'mccartney', 'lennon'] },
    { id: 'entity_charly_garcia', keywords: ['charly', 'garcia', 'garcía'] },
    { id: 'entity_shakira', keywords: ['shakira'] },
    { id: 'entity_coldplay', keywords: ['coldplay'] },
    { id: 'entity_sui_generis', keywords: ['sui generis'] },
    { id: 'entity_luis_alberto_spinetta', keywords: ['spinetta'] }
];

function runAutoPrelabel() {
    if (!fs.existsSync(PILOT_PATH)) {
        console.error('Pilot file not found at', PILOT_PATH);
        return;
    }
    
    const pilotData = JSON.parse(fs.readFileSync(PILOT_PATH, 'utf-8'));
    
    // We modify each label to include prelabel fields
    for (let i = 0; i < pilotData.labels.length; i++) {
        const label = pilotData.labels[i];
        
        if (label.gold_status === 'VERIFIED') {
            continue; // Do not touch verified records
        }

        // Initialize expected_* if they are missing or if this is the first run, but never overwrite non-null
        if (label.expected_entity_id === undefined) label.expected_entity_id = null;
        if (label.expected_work_id === undefined) label.expected_work_id = null;
        if (label.expected_venue_id === undefined) label.expected_venue_id = null;
        if (label.expected_content_type === undefined) label.expected_content_type = null;
        if (label.expected_performance_mode === undefined) label.expected_performance_mode = null;
        if (label.expected_content_role === undefined) label.expected_content_role = null;
        if (label.expected_primary_identity === undefined) label.expected_primary_identity = null;
        
        const titleLower = label.title.toLowerCase();
        
        // Simple heuristics
        let pre_entity = 'UNKNOWN';
        for (const e of KNOWN_ENTITIES) {
            if (e.keywords.some(k => titleLower.includes(k))) {
                pre_entity = e.id;
                break;
            }
        }
        
        let pre_role = 'PRIMARY';
        if (titleLower.includes('cover') || titleLower.includes('menciona') || titleLower.includes('tributo')) {
            pre_role = 'CONTEXTUAL';
        }
        
        let pre_mode = 'UNKNOWN';
        if (titleLower.includes('live') || titleLower.includes('en vivo')) {
            pre_mode = 'LIVE';
        } else if (titleLower.includes('oficial') || titleLower.includes('official audio')) {
            pre_mode = 'STUDIO';
        }
        
        let pre_type = 'MUSIC_VIDEO';
        if (titleLower.includes('entrevista') || titleLower.includes('interview')) {
            pre_type = 'INTERVIEW';
        } else if (titleLower.includes('making of')) {
            pre_type = 'MAKING_OF';
        }
        
        // Mask the prelabel for the first 10 items (Blind Review)
        if (i < 10) {
            label.review_mode = "BLIND";
            label.prelabel_hidden = true;
            label.prelabel_entity_id = null;
            label.prelabel_work_id = null;
            label.prelabel_venue_id = null;
            label.prelabel_content_type = null;
            label.prelabel_performance_mode = null;
            label.prelabel_content_role = null;
            label.prelabel_confidence = null;
            label.prelabel_evidence = null;
            label.prelabel_source = null;
            delete label.prelabel_notice;
        } else {
            label.review_mode = "PRELABEL_ASSISTED";
            label.prelabel_hidden = false;
            label.prelabel_entity_id = pre_entity;
            label.prelabel_work_id = 'UNKNOWN';
            label.prelabel_venue_id = 'UNKNOWN';
            label.prelabel_content_type = pre_type;
            label.prelabel_performance_mode = pre_mode;
            label.prelabel_content_role = pre_role;
            label.prelabel_confidence = 0.5;
            label.prelabel_evidence = ['title regex'];
            label.prelabel_source = 'auto_prelabel_script';
            delete label.prelabel_notice;
        }
    }
    
    fs.writeFileSync(PILOT_PATH, JSON.stringify(pilotData, null, 2));
    console.log(`Updated ${PILOT_PATH} with prelabels.`);
    console.log(`The first 10 assets have hidden prelabels for the Blind Review.`);
}

runAutoPrelabel();
