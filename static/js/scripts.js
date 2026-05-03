const content_dir = 'contents/'
const config_file = 'config.yml'
const section_names = ['home', 'publications', 'awards']
const visitor_storage_key = 'homepage-visitor-id-v1'


function getInteractionConfig() {
    return window.HOMEPAGE_INTERACTION_CONFIG || {};
}


function getPageKey() {
    return location.pathname.replace(/\/$/, '/index.html') || '/index.html';
}


function getVisitorId() {
    let visitorId = localStorage.getItem(visitor_storage_key);

    if (!visitorId) {
        visitorId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
        localStorage.setItem(visitor_storage_key, visitorId);
    }

    return visitorId;
}


async function supabaseRequest(path, options = {}) {
    const config = getInteractionConfig();

    if (!config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error('Missing Supabase interaction config.');
    }

    const response = await fetch(config.supabaseUrl.replace(/\/$/, '') + path, {
        ...options,
        headers: {
            apikey: config.supabaseAnonKey,
            Authorization: 'Bearer ' + config.supabaseAnonKey,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
            ...(options.headers || {})
        }
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}


async function loadInteractionState() {
    const pageKey = getPageKey();
    const visitorId = getVisitorId();
    const encodedPage = encodeURIComponent(pageKey);
    const encodedVisitor = encodeURIComponent(visitorId);

    await supabaseRequest('/rest/v1/rpc/increment_page_view', {
        method: 'POST',
        body: JSON.stringify({ page_key_input: pageKey })
    });

    const [pageRows, likeRows, likes] = await Promise.all([
        supabaseRequest('/rest/v1/page_stats?page_key=eq.' + encodedPage + '&select=views'),
        supabaseRequest('/rest/v1/page_likes?page_key=eq.' + encodedPage + '&visitor_id=eq.' + encodedVisitor + '&select=visitor_id'),
        supabaseRequest('/rest/v1/page_likes?page_key=eq.' + encodedPage + '&select=visitor_id')
    ]);

    return {
        views: pageRows[0]?.views || 0,
        liked: likeRows.length > 0,
        likes: likes.length
    };
}


function renderInteraction(state) {
    const viewCount = document.getElementById('view-count');
    const likeCount = document.getElementById('like-count');
    const likeButton = document.getElementById('like-button');
    const likeLabel = document.getElementById('like-label');

    if (!viewCount || !likeCount || !likeButton) {
        return;
    }

    viewCount.textContent = state.views;
    likeCount.textContent = state.likes;
    likeButton.classList.toggle('is-liked', state.liked);
    likeButton.setAttribute('aria-pressed', String(state.liked));

    if (likeLabel) {
        likeLabel.textContent = state.liked ? '\u5df2\u70b9\u8d5e' : '\u70b9\u8d5e';
    }
}


function renderInteractionError() {
    const viewCount = document.getElementById('view-count');
    const likeCount = document.getElementById('like-count');

    if (viewCount) {
        viewCount.textContent = '-';
    }

    if (likeCount) {
        likeCount.textContent = '-';
    }
}


async function initInteraction() {
    const likeButton = document.getElementById('like-button');

    if (!likeButton) {
        return;
    }

    const config = getInteractionConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
        renderInteractionError();
        return;
    }

    const state = await loadInteractionState();
    renderInteraction(state);

    likeButton.addEventListener('click', async () => {
        const pageKey = getPageKey();
        const visitorId = getVisitorId();

        likeButton.disabled = true;
        try {
            if (state.liked) {
                await supabaseRequest('/rest/v1/page_likes?page_key=eq.' + encodeURIComponent(pageKey) + '&visitor_id=eq.' + encodeURIComponent(visitorId), {
                    method: 'DELETE',
                    headers: {
                        Prefer: 'return=minimal'
                    }
                });
                state.liked = false;
                state.likes = Math.max(0, state.likes - 1);
            } else {
                await supabaseRequest('/rest/v1/page_likes', {
                    method: 'POST',
                    body: JSON.stringify({ page_key: pageKey, visitor_id: visitorId })
                });
                state.liked = true;
                state.likes += 1;
            }

            renderInteraction(state);
        } catch (error) {
            console.error(error);
        } finally {
            likeButton.disabled = false;
        }
    });
}


window.addEventListener('DOMContentLoaded', event => {

    // Activate Bootstrap scrollspy on the main nav element
    const mainNav = document.body.querySelector('#mainNav');
    if (mainNav) {
        new bootstrap.ScrollSpy(document.body, {
            target: '#mainNav',
            offset: 74,
        });
    };

    // Collapse responsive navbar when toggler is visible
    const navbarToggler = document.body.querySelector('.navbar-toggler');
    const responsiveNavItems = [].slice.call(
        document.querySelectorAll('#navbarResponsive .nav-link')
    );
    responsiveNavItems.map(function (responsiveNavItem) {
        responsiveNavItem.addEventListener('click', () => {
            if (window.getComputedStyle(navbarToggler).display !== 'none') {
                navbarToggler.click();
            }
        });
    });


    // Yaml
    fetch(content_dir + config_file)
        .then(response => response.text())
        .then(text => {
            const yml = jsyaml.load(text);
            Object.keys(yml).forEach(key => {
                try {
                    document.getElementById(key).innerHTML = yml[key];
                } catch {
                    console.log("Unknown id and value: " + key + "," + yml[key].toString())
                }

            })
        })
        .catch(error => console.log(error));


    // Marked
    marked.use({ mangle: false, headerIds: false })
    section_names.forEach((name, idx) => {
        fetch(content_dir + name + '.md')
            .then(response => response.text())
            .then(markdown => {
                const html = marked.parse(markdown);
                document.getElementById(name + '-md').innerHTML = html;
            }).then(() => {
                // MathJax
                MathJax.typeset();
            })
            .catch(error => console.log(error));
    })

    initInteraction().catch(error => {
        console.error(error);
        renderInteractionError();
    });

});
