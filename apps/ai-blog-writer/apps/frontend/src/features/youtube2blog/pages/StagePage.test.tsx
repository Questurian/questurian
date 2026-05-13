/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import StagePage from './StagePage'

describe('YouTube2Blog StagePage', () => {
  it('redirects /youtube2blog/stage to /youtube2blog/articles', () => {
    render(
      <MemoryRouter initialEntries={['/youtube2blog/stage']}>
        <Routes>
          <Route path="/youtube2blog/stage" element={<StagePage />} />
          <Route path="/youtube2blog/articles" element={<div>articles route</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('articles route')).toBeInTheDocument()
  })
})
