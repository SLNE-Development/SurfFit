"use client";

import { trpc } from "@/lib/trpc/client";
import { Button } from "@surffit/ui/components/ui/button";
import { Field, FieldLabel } from "@surffit/ui/components/ui/field";
import { Input } from "@surffit/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@surffit/ui/components/ui/select";
import { Textarea } from "@surffit/ui/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type Gym = {
  id: string;
  name: string;
  description: string | null;
  city: string;
  countryCode: string;
  address: string | null;
  equipment: { id: string; label: string; notes: string | null; equipmentName: string }[];
};

type EquipmentOption = { id: string; slug: string; name: string };

export function GymManage({
  gym,
  equipmentOptions,
}: {
  gym: Gym;
  equipmentOptions: EquipmentOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(gym.name);
  const [description, setDescription] = useState(gym.description ?? "");
  const [city, setCity] = useState(gym.city);
  const [countryCode, setCountryCode] = useState(gym.countryCode);
  const [address, setAddress] = useState(gym.address ?? "");

  const [equipmentId, setEquipmentId] = useState(equipmentOptions[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");

  const updateGym = trpc.gyms.update.useMutation({
    onSuccess: () => {
      toast.success("Saved");
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const addEquipment = trpc.gyms.addEquipment.useMutation({
    onSuccess: () => {
      toast.success("Equipment added");
      setLabel("");
      setNotes("");
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const removeEquipment = trpc.gyms.removeEquipment.useMutation({
    onSuccess: () => {
      toast.success("Equipment removed");
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          updateGym.mutate({
            gymId: gym.id,
            name,
            description: description || null,
            city,
            countryCode,
            address: address || null,
          });
        }}
      >
        <Field>
          <FieldLabel htmlFor="edit-name">Name</FieldLabel>
          <Input id="edit-name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="edit-description">Description</FieldLabel>
          <Textarea
            id="edit-description"
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, 2000))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="edit-city">City</FieldLabel>
          <Input id="edit-city" value={city} onChange={(event) => setCity(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="edit-country">Country code</FieldLabel>
          <Input
            id="edit-country"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
            maxLength={2}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="edit-address">Address</FieldLabel>
          <Input
            id="edit-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={updateGym.isPending} className="w-fit">
          Save
        </Button>
      </form>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Equipment</h3>
        {gym.equipment.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {item.label} <span className="text-muted-foreground">({item.equipmentName})</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={removeEquipment.isPending}
              onClick={() => removeEquipment.mutate({ gymId: gym.id, gymEquipmentId: item.id })}
            >
              Remove
            </Button>
          </div>
        ))}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addEquipment.mutate({ gymId: gym.id, equipmentId, label, notes: notes || null });
          }}
        >
          <Field>
            <FieldLabel>Equipment</FieldLabel>
            <Select value={equipmentId} onValueChange={(value) => value && setEquipmentId(value)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {equipmentOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="equipment-label">Label</FieldLabel>
            <Input
              id="equipment-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="equipment-notes">Notes</FieldLabel>
            <Input
              id="equipment-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={addEquipment.isPending}>
            Add
          </Button>
        </form>
      </div>
    </div>
  );
}
