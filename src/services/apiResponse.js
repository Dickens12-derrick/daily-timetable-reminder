export async function readApiResponse(response, fallbackMessage = 'Request failed') {
  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (typeof payload?.error === 'string') throw new Error(payload.error);
    if (response.status === 404) {
      throw new Error(
        'API endpoint not found (404). This deployment is serving the web app without its API. Deploy the combined app with the Render Blueprint, or set VITE_API_URL to your deployed API HTTPS origin, set CLIENT_ORIGIN on that API to this site, then rebuild and redeploy the frontend.',
      );
    }
    throw new Error(`${fallbackMessage} (${response.status}).`);
  }

  if (payload === null) throw new Error('The API returned an invalid response.');
  return payload;
}
