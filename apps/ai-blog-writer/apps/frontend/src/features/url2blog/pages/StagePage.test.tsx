/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import StagePage from './StagePage'

describe('URL2Blog StagePage', () => {
  it('redirects /url2blog/stage to /url2blog/articles', () => {
    render(
      <MemoryRouter initialEntries={['/url2blog/stage']}>
        <Routes>
          <Route path="/url2blog/stage" element={<StagePage />} />
          <Route path="/url2blog/articles" element={<div>articles route</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('articles route')).toBeTruthy()
  })
})
