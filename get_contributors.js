require('dotenv').config();
const axios = require('axios');
const { insertData } = require('./db_repos_data');
const { getContributionsLast30Days } = require('./get_30day_user_contributions');
const { isValidUrl, createGithubUrl } = require('./isValidUrl');
const { getTopRepoForOrg } = require('./get_org_repos');
const { pushUserRepos } = require('./repo_queue_mgt');
const getFollowing = require('./get_following');

async function getRepoDetails(repoUrl) {
    const token = process.env.GITHUB_TOKEN;
    const headers = {
        'Authorization': `token ${token}`
    };
    const repoParts = repoUrl.replace(/\/$/, '').split('/');
    const owner = repoParts[repoParts.length - 2];
    const repo = repoParts[repoParts.length - 1].replace('.git', '');
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const retryDelay = 60 * 60 * 1000; // 60 minutes

    console.log(`Fetching repo details from: ${apiUrl}`); // Debug log

    while (true) {
        try {
            const response = await axios.get(apiUrl, { headers });
            console.log(`Response status: ${response.status}`); // Debug log
            if (response.status === 200) {
                return {
                    stars: response.data.stargazers_count,
                    commits: await getCommitsCount(owner, repo, headers),
                    createdAt: response.data.created_at // Ensure createdAt is included
                };
            } else {
                console.error(`Failed to fetch repo details: ${response.status}`);
                return null;
            }
        } catch (error) {
            if (error.response && error.response.status === 403) {
                console.error(`Rate limit hit. Sleeping for 60 minutes...`);
                await sleep(retryDelay); // Sleep for 60 minutes
            } else {
                console.error(`Error fetching repo details: ${error.message}`);
                return null;
            }
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getCommitsCount(owner, repo, headers) {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits`;
    try {
        const response = await axios.get(apiUrl, { headers, params: { per_page: 1 } });
        if (response.status === 200) {
            const linkHeader = response.headers.link;
            if (linkHeader) {
                const lastPageMatch = linkHeader.match(/&page=(\d+)>; rel="last"/);
                if (lastPageMatch) {
                    console.log(`ParseInt: ${parseInt(lastPageMatch[1], 10)}`)
                    return parseInt(lastPageMatch[1], 10);
                }
            }
            return response.data.length;
        } else {
            console.error(`Failed to fetch commits count: ${response.status}`);
            return 0;
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        return 0;
    }
}

async function getContributors(repoUrl) {
    const token = process.env.GITHUB_TOKEN;
    const headers = {
        'Authorization': `token ${token}`
    };
    const repoParts = repoUrl.replace(/\/$/, '').split('/');
    const apiUrl = `https://api.github.com/repos/${repoParts[repoParts.length - 2]}/${repoParts[repoParts.length - 1].replace('.git', '')}/contributors`;

    let contributors = [];
    let page = 1;

    while (true) {
        try {
            const response = await axios.get(apiUrl, {
                headers: headers,
                params: { per_page: 100, page: page }
            });

            if (response.status === 200) {
                const data = response.data;
                if (data.length === 0) break;
                contributors = contributors.concat(data);
                page++;
            } else {
                console.error(`Failed to fetch contributors: ${response.status}`);
            }
        } catch (error) {
            if (error.response) {
                if (error.response.status === 401) {
                    console.error("Failed to fetch contributors: 401 Unauthorized");
                } else if (error.response.status === 404) {
                    console.error("Failed to fetch contributors: 404 Not Found");
                } else {
                    console.error(`Failed to fetch contributors: ${error.response.status}`);
                }
            } else {
                console.error(`Error: ${error.message}`);
            }
            break;
        }
    }

    return contributors;
}

async function fetchContributors(repoUrl) {
    console.log('repoURL: ' + repoUrl);

    if (!isValidUrl(repoUrl)) {
        repoUrl = createGithubUrl(repoUrl);
        if (!isValidUrl(repoUrl)) {
            console.error("Invalid repository URL provided.");
            process.exit(1);
        }
    }
    console.log('repoURL after check: ' + repoUrl);

    const repoParts = repoUrl.replace(/\/$/, '').split('/');
    const repoName = repoParts[repoParts.length - 1].replace('.git', '');

    let repoDetails = await getRepoDetails(repoUrl);
    console.log(`Repo details: ${JSON.stringify(repoDetails)}`); // Debug log
    if (!repoDetails) {
        console.error("Failed to fetch repository details.");
        const orgUrl = `https://api.github.com/orgs/${repoParts[repoParts.length - 2]}/repos`;
        let repos = await getTopRepoForOrg(orgUrl);
        if (repos && repos.length > 0) {
            repoUrl = repos[0].html_url;
            console.log('getReposForOrg returned a new url: ' + repoUrl);
            repoDetails = await getRepoDetails(repoUrl);
            if (!repoDetails) {
                console.error("Failed to fetch repository details[2].");
                process.exit(1);
            }
            console.log(`Repo details after fallback: ${JSON.stringify(repoDetails)}`); // Debug log
        }
    }

    if (repoDetails) {
        console.log(`Stars: ${repoDetails.stars}`);
        console.log(`Commits: ${repoDetails.commits}`);
        console.log(`Created At: ${repoDetails.createdAt}`);

        const contributors = await getContributors(repoUrl);
        const numContributors = contributors.length;
        console.log(`Contributors: ${numContributors}`);
        try {
            await insertData(repoUrl, numContributors, repoDetails.stars, repoDetails.commits, repoDetails.createdAt);
        } catch (error) {
            console.error(`Error inserting/updating data: ${error.message}`);
        }

        let allUsers = [...contributors]; // Start with the list of contributors

        for (const contributor of contributors) {
            const username = contributor.login;
            const following = await getFollowing(username);
            console.log(`Users followed by ${username}:`, following);
            allUsers = allUsers.concat(following.map(user => ({ login: user }))); // Add followed users to the list
        }

        for (const user of allUsers) {
            console.log(`user.login: ${user.login}`);
            const contributionsLast30Days = await getContributionsLast30Days(user.login);
            if (contributionsLast30Days) {
                console.log(`Contributions in the last 30 days for ${user.login}: ${contributionsLast30Days.total}`);
                const userJson = contributionsLast30Days.rspjs2;

                if (!userJson) {
                    console.log(`Skipping user with github_link: ${contributionsLast30Days.profileLink} due to missing rspjs2.`);
                    continue;
                }
    
                console.log(`Processing repos for github_link: ${contributionsLast30Days.profileLink}`);
    
                // Ensure pushUserRepos is called
                if (typeof pushUserRepos === 'function') {
                    console.log('pushUserRepos being called');
                    await pushUserRepos(userJson);
                } else {
                    console.error('pushUserRepos is not defined or not a function');
                }
    
            } else {
                console.error(`Failed to fetch contributions for ${user.login}`);
            }
        }

    } else {
        console.error("Failed to fetch repository details.");
    }
}

module.exports = { fetchContributors };
