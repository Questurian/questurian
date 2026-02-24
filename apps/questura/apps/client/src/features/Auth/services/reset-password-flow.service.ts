import { queryKeys } from '@/lib/react-query';

interface PasswordResetRequestMutation {
  mutateAsync: (data: { email: string }) => Promise<unknown>;
}

interface PasswordResetVerifyMutation {
  mutateAsync: (data: { email: string; code: string }) => Promise<unknown>;
}

interface PasswordResetMutation {
  mutateAsync: (data: {
    email: string;
    code: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<unknown>;
}

interface LoginMutation {
  mutate: (
    data: { email: string; password: string },
    options: {
      onSuccess: (data: { user: unknown }) => void | Promise<void>;
      onError: (error: unknown) => void;
    }
  ) => void;
}

interface QueryClientLike {
  setQueryData: (queryKey: readonly unknown[], updater: unknown) => void;
}

interface AutoLoginArgs {
  email: string;
  password: string;
  loginMutation: LoginMutation;
  queryClient: QueryClientLike;
  closeLoginModal: () => void;
  onSuccess?: () => void;
  redirectToHome: () => void;
  onError: (error: unknown) => void;
}

export async function requestPasswordResetCode(
  resetRequest: PasswordResetRequestMutation,
  email: string
): Promise<void> {
  await resetRequest.mutateAsync({ email });
}

export async function verifyPasswordResetCode(
  resetVerify: PasswordResetVerifyMutation,
  email: string,
  code: string
): Promise<void> {
  await resetVerify.mutateAsync({ email, code });
}

export async function submitPasswordReset(
  resetPassword: PasswordResetMutation,
  payload: {
    email: string;
    code: string;
    newPassword: string;
    confirmPassword: string;
  }
): Promise<void> {
  await resetPassword.mutateAsync(payload);
}

export function autoLoginAfterPasswordReset(args: AutoLoginArgs): Promise<void> {
  const {
    email,
    password,
    loginMutation,
    queryClient,
    closeLoginModal,
    onSuccess,
    redirectToHome,
    onError,
  } = args;

  return new Promise<void>((resolve) => {
    loginMutation.mutate(
      { email, password },
      {
        onSuccess: async (data) => {
          queryClient.setQueryData(queryKeys.userMe(), data.user);
          closeLoginModal();

          if (onSuccess) {
            onSuccess();
          } else {
            redirectToHome();
          }

          resolve();
        },
        onError: (error) => {
          onError(error);
          resolve();
        },
      }
    );
  });
}
