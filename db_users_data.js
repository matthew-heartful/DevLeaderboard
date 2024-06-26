require('dotenv').config();
const { supabaseClient } = require('./supabase_client.js');

const supabase = supabaseClient;

async function insertUserData(userData) {
    const { data, error } = await supabase
        .from('users')
        .upsert([userData], { onConflict: 'github_link' }) 
        .select();

    if (error) {
        console.error('Error inserting/updating data:', data, 'ERROR:', error);
    } else {
        console.log('Data inserted/updated successfully:', data);
    }
}

async function getAllUsers() {
    const { data, error } = await supabase
        .from('users')
        .select('*'); 

    if (error) {
        console.error('Error fetching data:', error);
        return [];
    } else {
        return data;
    }
}

async function getUserByGithubLink(githubLink) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('github_link', githubLink);

    if (error) {
        console.error('Error fetching user data:', error);
        return null;
    } else {
        return data;
    }
}

async function getLimitedUsers(limit = 50, offset = 0) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        console.error('Error fetching data:', error);
        return [];
    } else {
        return data;
    }
}

module.exports = { insertUserData, getAllUsers, getUserByGithubLink, getLimitedUsers };
