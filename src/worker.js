// Always assuming bsky.social because federation isn't real yet
const XRPC_ROOT = 'https://bsky.social/xrpc';

const POSTS_COLLECTION = 'app.bsky.feed.post';
const ACTORS_COLLECTION = 'app.bsky.actor.profile';

const BLUESKY_COLOR = '#0085ff';

// https://atproto.com/specs/handle#handle-identifier-syntax
const HANDLE_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

// https://atproto.com/specs/record-key#record-key-syntax
// Also exclude . and ..
const RKEY_REGEX = /^([a-zA-Z0-9-_.~]{1,512})$/;

async function getRecord(repo, collection, rkey) {
	const url = `${XRPC_ROOT}/com.atproto.repo.getRecord?repo=${repo}&collection=${collection}&rkey=${rkey}`;
	const response = await fetch(url);
	const json = await response.json();
	return json['value'];
}

async function resolveHandle(handle) {
	const url = `${XRPC_ROOT}/com.atproto.identity.resolveHandle?handle=${handle}`;
	const response = await fetch(url);
	const json = await response.json();
	return json['did'];
}

function getImageUrl(preset, did, cid, format) {
	return `https://av-cdn.bsky.app/img/${preset}/plain/${did}/${cid}@${format}`;
}

function generateMetaTags(original_url, did, handle, actor, post) {
	let tags = [
		`<meta name="theme-color" content="${BLUESKY_COLOR}"/>`,
		`<link rel="canonical" href="${original_url}" />`,
		`<meta property="og:url" content="${original_url}" />`,
		`<meta http-equiv="refresh" content="0;URL='${original_url}'" />`,
		`<meta property="og:site_name" content="Bluesky" />`,
		`<meta property="og:type" content="article" />`,
		`<meta property="og:title" content="${actor['displayName']} (@${handle})" />`,
		`<meta property="og:description" content="${post['text']}" />`,
	];

	if (post['embed']?.['images']) {
		tags.push('<meta name="twitter:card" content="summary_large_image" />');
		tags.push(...generateOpenGraphImages(did, post['embed']['images']));
	}

	return tags.join('\n');
}

function generateOpenGraphImages(did, images) {
	return images.flatMap((image) => [
		`<meta name="twitter:image" content="${getImageUrl('feed_thumbnail', did, image['image']['ref']['$link'], 'jpeg')}" />`,
		`<meta property="og:image:url" content="${getImageUrl('feed_thumbnail', did, image['image']['ref']['$link'], 'jpeg')}" />`,
	]);
}

export default {
	async fetch(request, _env, _ctx) {
		if (request.method !== 'GET') {
			return new Response('Method not allowed', { status: 405 });
		}

		let url = new URL(request.url);
		let path = url.pathname.substring(1).split('/');

		if (path.length !== 4 || path[0] !== 'profile' || path[2] !== 'post') {
			return new Response('Invalid URL', { status: 400 });
		}

		let [repo, rkey] = [path[1], path[3]];

		if (!HANDLE_REGEX.test(repo)) {
			return new Response('Invalid handle', { status: 422 });
		}

		if (!RKEY_REGEX.test(rkey) || rkey === '.' || rkey === '..') {
			return new Response('Invalid record key', { status: 422 });
		}

		let did = await resolveHandle(repo);
		let actor = await getRecord(repo, ACTORS_COLLECTION, 'self');

		if (!did || !actor) {
			return new Response('Invalid profile', { status: 400 });
		}

		let post = await getRecord(repo, POSTS_COLLECTION, rkey);

		if (!post) {
			return new Response('Invalid post', { status: 400 });
		}

		const bsky_url = `https://bsky.app/profile/${repo}/post/${rkey}`;
		const html = `<!DOCTYPE html>
<html>
<head>${generateMetaTags(bsky_url, did, repo, actor, post)}
<style>
body {
	color: #333;
	font-family: sans-serif;
	text-align: center;
	margin-top: 2rem;
}
</style>
</head>
<body>
<h4>Redirecting to <a href="${bsky_url}">${bsky_url}</a>...</h4>
<p>Not affiliated with Bluesky.</p>
</body>
</html>`.trim();

		return new Response(html, {
			headers: {
				'content-type': 'text/html;charset=UTF-8',
			},
		});
	},
};
