import { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  CustomerAddressRequest,
  CustomerAddressResponse,
  CustomerProfileUpdateRequest,
  CustomerType,
  UserProfile,
} from "@velora/contracts";
import { veloraApi } from "@/core/api/veloraApi";
import { useAuthStore } from "@/core/auth/authStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { saveCache } from "@/core/offline/mobileDb";
import { colors, commonStyles } from "@/shared/theme";
import {
  Button,
  CustomerShell,
  Field,
  Loading,
  Notice,
} from "@/shared/ui";

const blankAddress: CustomerAddressRequest = {
  label: "",
  recipientName: "",
  recipientPhone: "",
  department: "Santa Cruz",
  city: "Santa Cruz de la Sierra",
  zone: null,
  addressLine: "",
  reference: null,
  defaultAddress: false,
};

export default function AccountScreen() {
  const sessionUser = useAuthStore((state) => state.user)!;
  const replaceUser = useAuthStore((state) => state.replaceUser);
  const logout = useAuthStore((state) => state.logout);
  const client = useQueryClient();

  const profile = useQuery({
    queryKey: ["profile", sessionUser.id],
    queryFn: () =>
      cachedFetch<UserProfile>("profile", sessionUser.id, veloraApi.profile),
  });

  const addresses = useQuery({
    queryKey: ["addresses", sessionUser.id],
    queryFn: () =>
      cachedFetch<CustomerAddressResponse[]>(
        "addresses",
        sessionUser.id,
        veloraApi.addresses,
      ),
  });

  const [profileForm, setProfileForm] =
    useState<CustomerProfileUpdateRequest | null>(null);
  const [editing, setEditing] = useState<CustomerAddressResponse | null>(null);
  const [addressForm, setAddressForm] =
    useState<CustomerAddressRequest>(blankAddress);

  const effectiveProfile: CustomerProfileUpdateRequest | null =
    profileForm ??
    (profile.data
      ? {
          firstName: profile.data.firstName,
          lastName: profile.data.lastName,
          phone: profile.data.phone,
          customerType: profile.data.customerType ?? "B2C",
          businessName: profile.data.businessName,
          taxId: profile.data.taxId,
        }
      : null);

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!effectiveProfile) {
        throw new Error("El perfil no está disponible.");
      }
      return veloraApi.updateProfile(effectiveProfile);
    },
    onSuccess: async (user) => {
      await Promise.all([
        saveCache("profile", sessionUser.id, user),
        replaceUser(user),
      ]);
      client.setQueryData(["profile", sessionUser.id], user);
      setProfileForm({
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        customerType: user.customerType ?? "B2C",
        businessName: user.businessName,
        taxId: user.taxId,
      });
    },
  });

  const saveAddress = useMutation({
    mutationFn: async () => {
      if (editing) {
        return veloraApi.updateAddress(editing.id, addressForm);
      }
      return veloraApi.createAddress(addressForm);
    },
    onSuccess: async () => {
      const next = await veloraApi.addresses();
      await saveCache("addresses", sessionUser.id, next);
      client.setQueryData(["addresses", sessionUser.id], next);
      resetAddress();
    },
  });

  const deleteAddress = useMutation({
    mutationFn: veloraApi.deleteAddress,
    onSuccess: async () => {
      const next = await veloraApi.addresses();
      await saveCache("addresses", sessionUser.id, next);
      client.setQueryData(["addresses", sessionUser.id], next);
      resetAddress();
    },
  });

  const resetAddress = () => {
    setEditing(null);
    setAddressForm(blankAddress);
  };

  const editAddress = (address: CustomerAddressResponse) => {
    setEditing(address);
    setAddressForm({
      label: address.label,
      recipientName: address.recipientName,
      recipientPhone: address.recipientPhone,
      department: address.department,
      city: address.city,
      zone: address.zone,
      addressLine: address.addressLine,
      reference: address.reference,
      defaultAddress: address.defaultAddress,
    });
  };

  if (profile.isLoading) {
    return (
      <CustomerShell active="account">
        <Loading label="Cargando cuenta…" />
      </CustomerShell>
    );
  }

  return (
    <CustomerShell active="account">
      <Text style={commonStyles.eyebrow}>MI CUENTA</Text>
      <Text style={commonStyles.heading}>Datos y direcciones.</Text>

      {profile.isError ? (
        <Notice kind="warning">
          {profile.error instanceof Error
            ? profile.error.message
            : "No fue posible actualizar el perfil desde el servidor."}
        </Notice>
      ) : null}
      {saveProfile.isError ? (
        <Notice kind="error">
          {saveProfile.error instanceof Error
            ? saveProfile.error.message
            : "No fue posible guardar el perfil."}
        </Notice>
      ) : null}
      {saveProfile.isSuccess ? (
        <Notice kind="success">Perfil actualizado.</Notice>
      ) : null}

      {effectiveProfile ? (
        <View style={commonStyles.card}>
          <Text style={commonStyles.subheading}>Perfil</Text>
          <Field
            label="Nombre"
            value={effectiveProfile.firstName}
            onChangeText={(firstName) =>
              setProfileForm({ ...effectiveProfile, firstName })
            }
          />
          <Field
            label="Apellido"
            value={effectiveProfile.lastName}
            onChangeText={(lastName) =>
              setProfileForm({ ...effectiveProfile, lastName })
            }
          />
          <Field
            label="Teléfono"
            value={effectiveProfile.phone ?? ""}
            keyboardType="phone-pad"
            onChangeText={(phone) =>
              setProfileForm({
                ...effectiveProfile,
                phone: phone.trim() ? phone : null,
              })
            }
          />

          <Text style={commonStyles.label}>Tipo de cliente</Text>
          <View style={styles.options}>
            {(["B2C", "B2B"] as CustomerType[]).map((type) => (
              <Pressable
                key={type}
                style={[
                  commonStyles.chip,
                  effectiveProfile.customerType === type &&
                    commonStyles.chipActive,
                ]}
                onPress={() =>
                  setProfileForm({
                    ...effectiveProfile,
                    customerType: type,
                    businessName:
                      type === "B2C" ? null : effectiveProfile.businessName,
                    taxId: type === "B2C" ? null : effectiveProfile.taxId,
                  })
                }
              >
                <Text
                  style={[
                    commonStyles.chipText,
                    effectiveProfile.customerType === type &&
                      commonStyles.chipTextActive,
                  ]}
                >
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>

          {effectiveProfile.customerType === "B2B" ? (
            <>
              <Field
                label="Razón social"
                value={effectiveProfile.businessName ?? ""}
                onChangeText={(businessName) =>
                  setProfileForm({ ...effectiveProfile, businessName })
                }
              />
              <Field
                label="NIT"
                value={effectiveProfile.taxId ?? ""}
                onChangeText={(taxId) =>
                  setProfileForm({ ...effectiveProfile, taxId })
                }
              />
            </>
          ) : null}

          <Button
            title={saveProfile.isPending ? "GUARDANDO…" : "GUARDAR PERFIL"}
            disabled={saveProfile.isPending}
            onPress={() => saveProfile.mutate()}
          />
        </View>
      ) : null}

      <Text style={commonStyles.subheading}>Direcciones</Text>
      {addresses.isError ? (
        <Notice kind="warning">
          {addresses.error instanceof Error
            ? addresses.error.message
            : "No fue posible consultar direcciones."}
        </Notice>
      ) : null}

      <View style={{ gap: 10 }}>
        {addresses.data?.map((address) => (
          <View key={address.id} style={commonStyles.card}>
            <View style={commonStyles.rowBetween}>
              <Text style={commonStyles.subheading}>{address.label}</Text>
              {address.defaultAddress ? (
                <Text style={styles.defaultBadge}>PREDETERMINADA</Text>
              ) : null}
            </View>
            <Text style={commonStyles.body}>{address.addressLine}</Text>
            <Text style={commonStyles.muted}>
              {address.city} · {address.recipientName} · {address.recipientPhone}
            </Text>
            <View style={styles.actionRow}>
              <Pressable onPress={() => editAddress(address)}>
                <Text style={styles.link}>Editar</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Eliminar dirección",
                    "¿Desea eliminar esta dirección?",
                    [
                      { text: "Volver", style: "cancel" },
                      {
                        text: "Eliminar",
                        style: "destructive",
                        onPress: () => deleteAddress.mutate(address.id),
                      },
                    ],
                  )
                }
              >
                <Text style={[styles.link, { color: colors.error }]}>
                  Eliminar
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={commonStyles.card}>
        <Text style={commonStyles.subheading}>
          {editing ? "Editar dirección" : "Nueva dirección"}
        </Text>
        <Field
          label="Alias"
          value={addressForm.label}
          onChangeText={(label) => setAddressForm({ ...addressForm, label })}
          placeholder="Casa, trabajo…"
        />
        <Field
          label="Destinatario"
          value={addressForm.recipientName}
          onChangeText={(recipientName) =>
            setAddressForm({ ...addressForm, recipientName })
          }
        />
        <Field
          label="Teléfono"
          value={addressForm.recipientPhone}
          keyboardType="phone-pad"
          onChangeText={(recipientPhone) =>
            setAddressForm({ ...addressForm, recipientPhone })
          }
        />
        <Field
          label="Departamento"
          value={addressForm.department}
          onChangeText={(department) =>
            setAddressForm({ ...addressForm, department })
          }
        />
        <Field
          label="Ciudad"
          value={addressForm.city}
          onChangeText={(city) => setAddressForm({ ...addressForm, city })}
        />
        <Field
          label="Zona"
          value={addressForm.zone ?? ""}
          onChangeText={(zone) =>
            setAddressForm({
              ...addressForm,
              zone: zone.trim() ? zone : null,
            })
          }
        />
        <Field
          label="Dirección"
          value={addressForm.addressLine}
          onChangeText={(addressLine) =>
            setAddressForm({ ...addressForm, addressLine })
          }
        />
        <Field
          label="Referencia"
          value={addressForm.reference ?? ""}
          multiline
          onChangeText={(reference) =>
            setAddressForm({
              ...addressForm,
              reference: reference.trim() ? reference : null,
            })
          }
        />
        <View style={commonStyles.rowBetween}>
          <Text style={commonStyles.body}>Usar como predeterminada</Text>
          <Switch
            value={addressForm.defaultAddress}
            onValueChange={(defaultAddress) =>
              setAddressForm({ ...addressForm, defaultAddress })
            }
            trackColor={{ true: colors.terracotta }}
          />
        </View>

        {saveAddress.isError ? (
          <Notice kind="error">
            {saveAddress.error instanceof Error
              ? saveAddress.error.message
              : "No fue posible guardar la dirección."}
          </Notice>
        ) : null}

        <Button
          title={
            saveAddress.isPending
              ? "GUARDANDO…"
              : editing
                ? "ACTUALIZAR DIRECCIÓN"
                : "AGREGAR DIRECCIÓN"
          }
          disabled={saveAddress.isPending}
          onPress={() => saveAddress.mutate()}
        />
        {editing ? (
          <Button title="CANCELAR EDICIÓN" variant="secondary" onPress={resetAddress} />
        ) : null}
      </View>

      <Button
        title="CERRAR SESIÓN"
        variant="danger"
        onPress={() =>
          Alert.alert("Cerrar sesión", "¿Desea salir de su cuenta?", [
            { text: "Volver", style: "cancel" },
            {
              text: "Salir",
              style: "destructive",
              onPress: () =>
                void logout().then(() => {
                  client.clear();
                  router.replace("/login" as never);
                }),
            },
          ])
        }
      />
    </CustomerShell>
  );
}

const styles = StyleSheet.create({
  options: {
    flexDirection: "row",
    gap: 8,
  },
  defaultBadge: {
    color: colors.success,
    fontSize: 10,
    fontWeight: "900",
  },
  actionRow: {
    flexDirection: "row",
    gap: 18,
  },
  link: {
    color: colors.ink,
    fontWeight: "800",
  },
});
