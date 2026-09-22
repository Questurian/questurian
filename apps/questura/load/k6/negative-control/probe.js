// The smallest scenario that exercises every gate L13 claims to have: a
// landing page, an article, a redirect, an anonymous identity and a
// signed-in identity. Run against `fake-target.mjs` in each fault mode; each
// mode must make this exit nonzero.
import { ARTICLE_PATHS, LANDING_PATHS, pick } from '../lib/config.js'
import { identity, page } from '../lib/requests.js'

export const options = {
  vus: 2,
  iterations: 20,
  thresholds: {
    checks: ['rate>0.999'],
    http_req_failed: ['rate<0.001'],
  },
}

export default function () {
  page(pick(LANDING_PATHS), 'landing')
  page(pick(ARTICLE_PATHS), 'article')
  page('/old-lima', 'redirect')
  identity()
  identity('session=synthetic-member')
}
