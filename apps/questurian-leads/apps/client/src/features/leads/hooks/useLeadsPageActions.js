import {
  useDeleteLead,
  useDetectLeadLanguages,
  useTranslateLeads,
} from '../../../hooks';
import { useDialog } from '../../../providers/DialogProvider';

export function useLeadsPageActions({ filters }) {
  const dialog = useDialog();
  const deleteLead = useDeleteLead();
  const translateLeads = useTranslateLeads();
  const detectLanguages = useDetectLeadLanguages();

  async function handleDelete(id) {
    const confirmed = await dialog.confirm(
      'Are you sure you want to delete this lead?',
    );

    if (!confirmed) return;

    try {
      await deleteLead.mutateAsync(id);
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  async function handleTranslate() {
    const confirmed = await dialog.confirm(
      'Translate all pending leads to English?',
    );

    if (!confirmed) return;

    try {
      const result = await translateLeads.mutateAsync(filters);

      await dialog.alert(
        `Translation complete!\n${result.stats.translated} translated\n${result.stats.already_english} already in English`,
      );
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  async function handleDetectLanguages() {
    const confirmed = await dialog.confirm(
      'Re-detect language for ALL leads? This will fix any incorrect language detections.',
    );

    if (!confirmed) return;

    try {
      const result = await detectLanguages.mutateAsync(true);
      await dialog.alert(
        `Language detection complete!\n${result.leads_updated} leads updated`,
      );
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  return {
    detectPending: detectLanguages.isPending,
    handleDelete,
    handleDetectLanguages,
    handleTranslate,
    isMutating:
      deleteLead.isPending ||
      translateLeads.isPending ||
      detectLanguages.isPending,
    translatePending: translateLeads.isPending,
  };
}
