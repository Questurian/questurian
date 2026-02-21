import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clock3 } from 'lucide-react';
import { FormTextarea } from '@client/shared/components/forms';
import { Button } from '@client/components/ui/button';
import { useToast } from '@client/shared/hooks/useToast';
import { useAddInstagramEmbed } from '@client/shared/services/api/hooks/useAddInstagramEmbed';
import type { Category, InstagramEmbed } from '@client/shared/services/api/types';
import type { QueuedInstagramEmbedPayload } from '@client/shared/types/location-media.types';
import {
  addInstagramEmbedSchema,
  type AddInstagramEmbedFormData,
} from '../validation/add-instagram-embed.schema';

interface AddInstagramEmbedFormProps {
  category?: Category;
  locationId?: number;
  locationLabel?: string;
  onQueueEmbed?: (payload: QueuedInstagramEmbedPayload) => void;
}

export function AddInstagramEmbedForm({ category, locationId, locationLabel, onQueueEmbed }: AddInstagramEmbedFormProps) {
  const { showToast } = useToast();
  const isUploadMode = typeof locationId === 'number' && !!category;

  const form = useForm<AddInstagramEmbedFormData>({
    resolver: zodResolver(addInstagramEmbedSchema),
    defaultValues: {
      embedCode: '',
    },
  });

  const mutation = useAddInstagramEmbed(category ?? null, locationId ?? 0, {
    onSuccess: (data: InstagramEmbed) => {
      const centerPosition = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      showToast(`Instagram embed added for @${data.username}`, centerPosition);
      form.reset();
    },
    onError: (error: Error) => {
      const centerPosition = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      showToast(error.message || 'Failed to add Instagram embed', centerPosition);
    },
  });

  function handleSubmit(data: AddInstagramEmbedFormData) {
    if (!isUploadMode) {
      if (!onQueueEmbed) {
        const centerPosition = {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        };
        showToast('Unable to queue Instagram embed before document creation.', centerPosition);
        return;
      }

      onQueueEmbed({ embedCode: data.embedCode });
      const centerPosition = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      showToast('Instagram embed queued. It will be added after document creation.', centerPosition);
      form.reset();
      return;
    }

    mutation.mutate(data.embedCode);
  }

  return (
    <div className="border rounded-lg p-4 bg-muted/50 space-y-3" style={{ height: '368px' }}>
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
        {isUploadMode ? 'Add Instagram Embed' : 'Queue Instagram Embed'}
        {!isUploadMode && <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />}
      </h4>
      {isUploadMode && (
        <p className="text-xs text-muted-foreground">
          Target: #{locationId}{locationLabel ? ` ${locationLabel}` : ""}
        </p>
      )}

      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
        <FormTextarea
          control={form.control}
          name="embedCode"
          label="Instagram Embed Code"
          placeholder='<blockquote class="instagram-media"...'
          description="Paste the full Instagram embed code from instagram.com"
          rows={9}
          className="font-mono text-sm"
        />

        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={(isUploadMode && mutation.isPending) || !form.formState.isValid}
            size="sm"
          >
            {isUploadMode
              ? mutation.isPending
                ? 'Adding...'
                : 'Add Embed'
              : 'Queue Embed'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
            disabled={isUploadMode && mutation.isPending}
            size="sm"
          >
            Clear
          </Button>
        </div>
      </form>
    </div>
  );
}
