/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import StagePage from './StagePage'

describe('Prompt2Blog StagePage', () => {
  it('redirects /prompt2blog/stage to /prompt2blog/articles', () => {
    render(
      <MemoryRouter initialEntries={['/prompt2blog/stage']}>
        <Routes>
          <Route path="/prompt2blog/stage" element={<StagePage />} />
          <Route path="/prompt2blog/articles" element={<div>articles route</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('articles route')).toBeTruthy()
  })
})
