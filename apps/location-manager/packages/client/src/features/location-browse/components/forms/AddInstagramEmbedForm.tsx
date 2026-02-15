import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormTextarea } from "@client/shared/components/forms";
import { Button } from "@client/components/ui/button";
import { useToast } from "@client/shared/hooks/useToast";
import { useAddInstagramEmbed } from "@client/shared/services/api/hooks/useAddInstagramEmbed";
import {
  addInstagramEmbedSchema,
  type AddInstagramEmbedFormData,
} from "../../validation/add-instagram-embed.schema";

interface AddInstagramEmbedFormProps {
  locationId: number;
}

export function AddInstagramEmbedForm({ locationId }: AddInstagramEmbedFormProps) {
  const { showToast } = useToast();

  const form = useForm<AddInstagramEmbedFormData>({
    resolver: zodResolver(addInstagramEmbedSchema),
    defaultValues: {
      embedCode: "",
    },
  });

  const mutation = useAddInstagramEmbed(locationId, {
    onSuccess: (data) => {
      // Position toast at center of viewport for form feedback
      const centerPosition = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      showToast(`Instagram embed added for @${data.username}`, centerPosition);
      form.reset();
    },
    onError: (error) => {
      // Position toast at center of viewport for form feedback
      const centerPosition = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      showToast(error.message || "Failed to add Instagram embed", centerPosition);
    },
  });

  function handleSubmit(data: AddInstagramEmbedFormData) {
    mutation.mutate(data.embedCode);
  }

  return (
    <div className="border rounded-lg p-4 bg-muted/50 space-y-3" style={{ height: '368px' }}>
      <h4 className="text-sm font-semibold text-foreground">Add Instagram Embed</h4>

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
            disabled={mutation.isPending || !form.formState.isValid}
            size="sm"
          >
            {mutation.isPending ? "Adding..." : "Add Embed"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
            disabled={mutation.isPending}
            size="sm"
          >
            Clear
          </Button>
        </div>
      </form>
    </div>
  );
}
