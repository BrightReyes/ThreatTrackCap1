import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

export function toastSuccess(title) {
  return Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title,
    showConfirmButton: false,
    timer: 2200,
    timerProgressBar: true,
  });
}

export function toastError(title) {
  return Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'error',
    title,
    showConfirmButton: false,
    timer: 3200,
    timerProgressBar: true,
  });
}

export async function confirmDanger({ title, text, confirmText = 'Confirm' }) {
  const result = await Swal.fire({
    icon: 'warning',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#ef4444',
    focusCancel: true,
  });
  return result.isConfirmed;
}

