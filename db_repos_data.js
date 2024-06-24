require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function insertData(name, contributors, stars, commits) {
    const newRepo = {
        name,
        contributors,
        stars,
        commits,
        last_request: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('repos')
        .upsert(newRepo, { onConflict: 'name' })
        .select();

    if (error) {
        console.error('Error inserting/updating data:', error);
    } else {
        console.log('Inserted/Updated data:', data);
    }
}

async function printRepoData() {
    const { data, error } = await supabase
        .from('repos')
        .select('*');

    if (error) {
        console.error('Error fetching data:', error);
    } else {
        console.log('Repository Data:', data);
    }
}

module.exports = { insertData, printRepoData };