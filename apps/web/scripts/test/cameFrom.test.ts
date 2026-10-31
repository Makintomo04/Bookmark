// Where a book page's breadcrumb leads back to.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/cameFrom.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { crumbLabel, isBookPath } from '../../lib/cameFrom'

describe('crumbLabel', () => {
  it("uses the page's own title, without the site name", () => {
    assert.equal(crumbLabel('/discover', 'Discover | Bookmark'), 'Discover')
    assert.equal(crumbLabel('/authors/le-guin', 'Books by Ursula K. Le Guin | Bookmark'), 'Books by Ursula K. Le Guin')
  })
  it('names a profile by its reader', () => {
    assert.equal(crumbLabel('/u/sam', "Sam's reading | Bookmark"), 'Sam')
  })
  it('falls back to the section when the title says nothing', () => {
    assert.equal(crumbLabel('/shelf?tab=read', ''), 'Shelf')
    assert.equal(crumbLabel('/reading-circles', 'Home | Bookmark'), 'Reading circles')
  })
})

describe('isBookPath', () => {
  it("leaves book pages out of the trail", () => {
    assert.equal(isBookPath('/books/OL1W-dune'), true)
    assert.equal(isBookPath('/discover'), false)
  })
})
