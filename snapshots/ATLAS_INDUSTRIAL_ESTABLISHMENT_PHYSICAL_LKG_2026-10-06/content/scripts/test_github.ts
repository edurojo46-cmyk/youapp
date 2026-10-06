async function testGitHubPagination() {
  const t0 = Date.now();
  const res = await fetch('https://api.github.com/search/users?q=location:argentina&per_page=100&page=1', {
    headers: {
      'User-Agent': 'AtlasPersonSearch/1.0',
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  console.log(`GitHub fetch took ${Date.now() - t0}ms, status: ${res.status}`);
  if (res.ok) {
    const data = await res.json();
    console.log(`total_count: ${data.total_count}, items returned: ${data.items.length}`);
    console.log('Sample item:', data.items[0]?.login, data.items[0]?.html_url, data.items[0]?.avatar_url);
  } else {
    console.log('Error:', res.statusText);
  }
}

testGitHubPagination();
