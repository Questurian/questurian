'use client'

/**
 * Step1Wrapper Component
 *
 * Manages the multi-step form workflow for Rankings collection.
 * Delegates all workflow logic to useStep1Workflow hook, keeping this component
 * focused purely on rendering.
 *
 * State Management:
 * - Controlled by useStep1Workflow hook
 * - Hook handles validation, state transitions, and confirmation dialogs
 * - Component simply renders buttons and UI based on hook state
 */

import { ComponentProps } from 'react'
import { Button } from '@payloadcms/ui'
import { useStep1Workflow } from '../../hooks/useStep1Workflow'
import styles from '../../styles/Step1Wrapper.module.css'

type FieldProps = ComponentProps<any>

const Step1Wrapper = (props: FieldProps) => {
  // Get all workflow state and handlers from the hook
  // This keeps the component clean and focused on rendering
  const {
    isStep1Complete,
    step1_complete,
    in_update_mode,
    validationErrors,
    showConfirmDialog,
    pendingChange,
    handleContinue,
    handleUpdate,
    handleSaveChanges,
    handleConfirmChange,
    handleCancelChange,
    handleCancelUpdate,
  } = useStep1Workflow()

  return (
    <div className={styles.wrapper}>
      {/* Display validation errors when trying to continue without all fields filled */}
      {validationErrors.length > 0 && (
        <div className={styles.errorContainer}>
          <h4>Please correct the following:</h4>
          <ul>
            {validationErrors.map((error) => (
              <li key={error.field}>{error.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Show Continue button when Step 1 is not complete */}
      {!step1_complete && (
        <Button onClick={handleContinue} disabled={!isStep1Complete}>
          Continue
        </Button>
      )}

      {/* Show Update button when Step 1 is complete and not in update mode */}
      {step1_complete && !in_update_mode && (
        <Button onClick={handleUpdate} buttonStyle="secondary">
          Update Setup
        </Button>
      )}

      {/* Show Save Changes and Cancel Update buttons when in update mode */}
      {in_update_mode && (
        <div className={styles.updateButtonGroup}>
          <Button onClick={handleSaveChanges} disabled={!isStep1Complete}>
            Save Changes
          </Button>
          <Button onClick={handleCancelUpdate} buttonStyle="secondary">
            Cancel Update
          </Button>
        </div>
      )}

      {/* Confirmation dialog for clearing items when ranking type/location changes */}
      {showConfirmDialog && pendingChange && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Clear Ranking Items?</h3>
            <p>
              Changing the {pendingChange.field === 'rankingType' ? 'ranking type' : 'location'}{' '}
              will clear all ranking items you've added. Continue?
            </p>
            <div className={styles.modalButtons}>
              <Button onClick={handleConfirmChange}>Clear & Continue</Button>
              <Button onClick={handleCancelChange} buttonStyle="secondary">
                Keep Items
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Step1Wrapper
