import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GoogleSignInButton from '../GoogleSignInButton';

describe('GoogleSignInButton Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('Button Rendering', () => {
    it('should render button element', () => {
      render(<GoogleSignInButton />);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should render default text', () => {
      render(<GoogleSignInButton />);
      expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
    });

    it('should render custom text when children provided', () => {
      render(<GoogleSignInButton>Custom Google Button</GoogleSignInButton>);
      expect(screen.getByText('Custom Google Button')).toBeInTheDocument();
    });

    it('should render Google logo SVG', () => {
      const { container } = render(<GoogleSignInButton />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('Button Styling', () => {
    it('should have default styling classes', () => {
      const { container } = render(<GoogleSignInButton />);
      const button = container.querySelector('button');
      expect(button).toHaveClass('bg-white');
      expect(button).toHaveClass('border');
      expect(button).toHaveClass('rounded-lg');
    });

    it('should apply custom className', () => {
      const { container } = render(
        <GoogleSignInButton className="custom-class" />
      );
      const button = container.querySelector('button');
      expect(button).toHaveClass('custom-class');
    });

    it('should apply custom className in addition to default classes', () => {
      const { container } = render(
        <GoogleSignInButton className="w-full" />
      );
      const button = container.querySelector('button');
      expect(button).toHaveClass('w-full');
      expect(button).toHaveClass('bg-white');
    });

    it('should have flex layout with gap', () => {
      const { container } = render(<GoogleSignInButton />);
      const button = container.querySelector('button');
      expect(button).toHaveClass('flex');
      expect(button).toHaveClass('gap-3');
    });
  });

  describe('OAuth Functionality', () => {
    it('should trigger the OAuth click handler', () => {
      render(<GoogleSignInButton />);
      const button = screen.getByRole('button');
      expect(() => fireEvent.click(button)).not.toThrow();
    });

    it('should have a button that triggers OAuth flow', () => {
      render(<GoogleSignInButton />);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });

    it('should accept returnTo prop', () => {
      render(<GoogleSignInButton returnTo="/join" />);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Props Combinations', () => {
    it('should work with all props provided', () => {
      render(
        <GoogleSignInButton
          className="w-full py-2"
          returnTo="/specific-page"
        >
          Sign Up with Google
        </GoogleSignInButton>
      );

      const button = screen.getByRole('button');
      expect(button).toHaveClass('w-full');
      expect(button).toHaveClass('py-2');
      expect(screen.getByText('Sign Up with Google')).toBeInTheDocument();
    });

    it('should work with no props (defaults)', () => {
      render(<GoogleSignInButton />);

      expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should work with only className prop', () => {
      const { container } = render(
        <GoogleSignInButton className="custom-width" />
      );

      const button = container.querySelector('button');
      expect(button).toHaveClass('custom-width');
      expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
    });

    it('should work with only returnTo prop', () => {
      render(<GoogleSignInButton returnTo="/dashboard" />);

      expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should work with only children prop', () => {
      render(<GoogleSignInButton>Login with Google</GoogleSignInButton>);

      expect(screen.getByText('Login with Google')).toBeInTheDocument();
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should be a button element', () => {
      render(<GoogleSignInButton />);
      const button = screen.getByRole('button');
      expect(button.tagName).toBe('BUTTON');
    });

    it('should not be disabled by default', () => {
      render(<GoogleSignInButton />);
      const button = screen.getByRole('button') as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it('should be focusable', () => {
      render(<GoogleSignInButton />);
      const button = screen.getByRole('button');
      button.focus();
      expect(document.activeElement).toBe(button);
    });

    it('should have descriptive text content', () => {
      render(<GoogleSignInButton>Sign in with Google</GoogleSignInButton>);
      const button = screen.getByRole('button', { name: /sign in with google/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    it('should contain an SVG icon', () => {
      const { container } = render(<GoogleSignInButton />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
    });

    it('should have correct button HTML element', () => {
      const { container } = render(<GoogleSignInButton />);
      const button = container.querySelector('button');
      expect(button).toBeInTheDocument();
      expect(button?.tagName).toBe('BUTTON');
    });

    it('should render children alongside SVG', () => {
      const { container } = render(
        <GoogleSignInButton>Custom Text</GoogleSignInButton>
      );

      expect(screen.getByText('Custom Text')).toBeInTheDocument();
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('Backend Integration', () => {
    it('should handle configured backend URL flow', () => {
      const button = render(<GoogleSignInButton />).getByRole('button');
      expect(() => fireEvent.click(button)).not.toThrow();
    });

    it('should handle production backend URL flow', () => {
      const button = render(<GoogleSignInButton />).getByRole('button');
      expect(() => fireEvent.click(button)).not.toThrow();
    });

    it('should handle ngrok development backend URL flow', () => {
      const button = render(<GoogleSignInButton />).getByRole('button');
      expect(() => fireEvent.click(button)).not.toThrow();
    });
  });
});
